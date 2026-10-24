// Level description DSL. Author levels as TypeScript modules by calling
// `defineLevel({ ..., build(L) { ... } })` and composing semantic helpers on
// the builder `L` (room, sconce, codedChest, keyedDoor, readable, pickup, etc.).
// The result is validated against the zod schema before being handed back.
//
// Design goals: terse, typed, easy to tweak coordinates. Any detail the
// semantic helpers don't cover can be dropped to the raw primitives
// (L.box / L.cylinder / L.sphere / L.light / L.object).

import {
  Level as LevelSchema,
  type Level,
  type SceneObject,
  type Light,
  type Mesh,
  type Material,
  type Pose,
  type Interact,
} from '@/schema/level'

export type Vec3 = [number, number, number]

type PrimitiveShape = 'box' | 'cylinder' | 'plane' | 'sphere'

export type LevelMeta = {
  id: string
  name: string
  background?: string
  playerStart: { position: Vec3; rotationY?: number }
  build: (L: LevelBuilder) => void
}

export class LevelBuilder {
  readonly objects: SceneObject[] = []
  readonly lights: Light[] = []
  private readonly ids = new Set<string>()
  private _exitId: string | null = null
  private counters = new Map<string, number>()

  /** Produce a unique id with the given prefix. */
  uid(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, n)
    return `${prefix}-${n}`
  }

  private push(obj: SceneObject) {
    if (this.ids.has(obj.id)) {
      throw new Error(`Duplicate scene object id "${obj.id}"`)
    }
    this.ids.add(obj.id)
    this.objects.push(obj)
  }

  private pushLight(light: Light) {
    this.lights.push(light)
  }

  /** Register which object acts as the exit. Only one level-wide. */
  setExit(id: string) {
    this._exitId = id
  }

  exitId(): string {
    if (!this._exitId) throw new Error('Level has no exit — mark one with L.keyedDoor({ exitId: true }) or L.setExit(id)')
    return this._exitId
  }

  // ---- Raw primitives ------------------------------------------------------

  object(spec: SceneObject): SceneObject {
    this.push(spec)
    return spec
  }

  box(opts: {
    id: string
    name?: string
    at: Vec3
    size: Vec3
    color: string
    roughness?: number
    metalness?: number
    emissive?: string
    emissiveIntensity?: number
    texture?: 'brick'
    rotationY?: number
    isSolid?: boolean
    castShadow?: boolean
    receiveShadow?: boolean
    pose?: Pose
    interact?: Interact
  }): SceneObject {
    return this.primitive('box', opts)
  }

  cylinder(opts: Parameters<LevelBuilder['box']>[0]): SceneObject {
    return this.primitive('cylinder', opts)
  }

  sphere(opts: Parameters<LevelBuilder['box']>[0]): SceneObject {
    return this.primitive('sphere', opts)
  }

  plane(opts: Parameters<LevelBuilder['box']>[0]): SceneObject {
    return this.primitive('plane', opts)
  }

  private primitive(shape: PrimitiveShape, opts: Parameters<LevelBuilder['box']>[0]): SceneObject {
    const mat: Material = {
      color: opts.color,
      roughness: opts.roughness ?? 0.8,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      texture: opts.texture,
    }
    const mesh: Mesh = { kind: 'primitive', shape, size: opts.size, material: mat }
    const obj: SceneObject = {
      id: opts.id,
      name: opts.name ?? opts.id,
      mesh,
      transform: {
        position: opts.at,
        rotation: [0, opts.rotationY ?? 0, 0],
        scale: [1, 1, 1],
      },
      isSolid: opts.isSolid ?? false,
      castShadow: opts.castShadow ?? true,
      receiveShadow: opts.receiveShadow ?? true,
      pose: opts.pose,
      interact: opts.interact,
    }
    this.push(obj)
    return obj
  }

  light(spec: Light): Light {
    this.pushLight(spec)
    return spec
  }

  // ---- Lighting shorthands --------------------------------------------------

  ambient(opts: { color?: string; intensity?: number } = {}): Light {
    return this.light({
      id: this.uid('ambient'),
      type: 'ambient',
      position: [0, 0, 0],
      color: opts.color ?? '#ffffff',
      intensity: opts.intensity ?? 0.2,
      castShadow: false,
    })
  }

  pointLight(opts: {
    at: Vec3
    color?: string
    intensity?: number
    distance?: number
    castShadow?: boolean
    flicker?: { amount: number; speed?: number }
    id?: string
  }): Light {
    return this.light({
      id: opts.id ?? this.uid('point'),
      type: 'point',
      position: opts.at,
      color: opts.color ?? '#ffffff',
      intensity: opts.intensity ?? 1,
      distance: opts.distance,
      castShadow: opts.castShadow ?? false,
      flicker: opts.flicker ? { amount: opts.flicker.amount, speed: opts.flicker.speed ?? 10 } : undefined,
    })
  }

  // ---- Semantic helpers -----------------------------------------------------

  /**
   * Build a rectangular room centred at origin on the XZ plane. Floor top at
   * y=0, ceiling at y=height. Returns the 6 wall objects it created (so you
   * can further reference them, but normally you'll just move on).
   */
  room(opts: {
    size: [number, number, number] // [width, height, depth] — width is X, depth is Z
    floor: string
    ceiling: string
    walls: string
    wallThickness?: number
  }) {
    const [w, h, d] = opts.size
    const t = opts.wallThickness ?? 0.2
    this.box({ id: 'floor', name: 'Floor', at: [0, -0.05, 0], size: [w, 0.1, d], color: opts.floor, roughness: 1, isSolid: true, castShadow: false })
    this.box({ id: 'ceiling', name: 'Ceiling', at: [0, h + 0.05, 0], size: [w, 0.1, d], color: opts.ceiling, roughness: 1, castShadow: false })
    this.box({ id: 'wall-north', name: 'Wall (N)', at: [0, h / 2, -d / 2], size: [w, h, t], color: opts.walls, roughness: 0.95, isSolid: true, castShadow: false })
    this.box({ id: 'wall-south', name: 'Wall (S)', at: [0, h / 2, d / 2], size: [w, h, t], color: opts.walls, roughness: 0.95, isSolid: true, castShadow: false })
    this.box({ id: 'wall-east', name: 'Wall (E)', at: [w / 2, h / 2, 0], size: [t, h, d], color: opts.walls, roughness: 0.95, isSolid: true, castShadow: false })
    this.box({ id: 'wall-west', name: 'Wall (W)', at: [-w / 2, h / 2, 0], size: [t, h, d], color: opts.walls, roughness: 0.95, isSolid: true, castShadow: false })
  }

  /**
   * ASCII-grid labyrinth. `#` places a full-cell stone block, any other
   * character leaves the cell as walkable corridor. Also lays down a slab
   * floor and ceiling spanning the whole grid. The grid is centred on the
   * origin on the XZ plane.
   *
   * Returns `cellCenter(row, col)` so callers can place pickups, doors,
   * sconces, etc. at exact cell positions.
   *
   * Convention: use `S` for the player-start cell, `E` for the exit cell,
   * and `K` for the key (these are just markers — the helper treats them
   * as open cells; the caller still places the actual objects at the
   * returned coordinates).
   */
  labyrinth(opts: {
    grid: string[]
    cellSize?: number
    wallHeight?: number
    wallColor?: string
    floorColor?: string
    ceilingColor?: string
  }): { cellCenter: (row: number, col: number) => Vec3; cellSize: number; rows: number; cols: number } {
    const grid = opts.grid
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    if (rows === 0 || cols === 0) throw new Error('Labyrinth grid is empty')
    for (const row of grid) {
      if (row.length !== cols) throw new Error('Labyrinth rows must all be the same length')
    }
    const cs = opts.cellSize ?? 2
    const h = opts.wallHeight ?? 3
    const wallColor = opts.wallColor ?? '#2b241d'
    const floorColor = opts.floorColor ?? '#15120f'
    const ceilingColor = opts.ceilingColor ?? '#09080a'

    const extentX = cols * cs
    const extentZ = rows * cs

    // Roughness kept well below 1 so stone catches a mild specular glint from
    // sconces — fully matte surfaces at these dark base colors absorb almost
    // everything the lights throw at them and the maze reads as pitch black.
    this.box({ id: this.uid('maze-floor'), name: 'Maze floor', at: [0, -0.05, 0], size: [extentX, 0.1, extentZ], color: floorColor, roughness: 0.82, isSolid: true, castShadow: false })
    this.box({ id: this.uid('maze-ceiling'), name: 'Maze ceiling', at: [0, h + 0.05, 0], size: [extentX, 0.1, extentZ], color: ceilingColor, roughness: 0.9, castShadow: false })

    const cellCenter = (row: number, col: number): Vec3 => {
      const x = -extentX / 2 + col * cs + cs / 2
      const z = -extentZ / 2 + row * cs + cs / 2
      return [x, 0, z]
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== '#') continue
        const [x, , z] = cellCenter(r, c)
        this.box({
          id: this.uid('maze-wall'),
          name: `Wall (${r},${c})`,
          at: [x, h / 2, z],
          size: [cs, h, cs],
          color: wallColor,
          roughness: 0.78,
          texture: 'brick',
          isSolid: true,
          castShadow: true,
          receiveShadow: true,
        })
      }
    }

    return { cellCenter, cellSize: cs, rows, cols }
  }

  /**
   * Wall-mounted sconce: bracket + bowl + emissive flame + flickering warm
   * point light. `at` is the flame's position; the bracket sits a bit toward
   * the wall side you specify.
   */
  sconce(opts: {
    at: Vec3
    side: 'north' | 'south' | 'east' | 'west'
    color?: string
    intensity?: number
    distance?: number
    castShadow?: boolean
    id?: string
  }) {
    const id = opts.id ?? this.uid('sconce')
    const color = opts.color ?? '#ffa258'
    const [x, y, z] = opts.at
    const toWall = { north: [0, 0, -0.2], south: [0, 0, 0.2], east: [0.2, 0, 0], west: [-0.2, 0, 0] }[opts.side] as Vec3
    const bracketAt: Vec3 = [x + toWall[0], y - 0.1, z + toWall[2]]
    const bracketRot = (opts.side === 'east' || opts.side === 'west') ? Math.PI / 2 : 0

    this.cylinder({ id: `${id}-bracket`, name: 'Sconce bracket', at: bracketAt, size: [0.08, 0.3, 0.08], color: '#1a1612', metalness: 0.5, roughness: 0.8, rotationY: bracketRot })
    this.cylinder({ id: `${id}-bowl`, name: 'Sconce bowl', at: [x, y - 0.05, z], size: [0.22, 0.1, 0.22], color: '#2a2018', roughness: 0.6, metalness: 0.7 })
    this.flame({ id: `${id}-flame`, name: 'Sconce flame', at: [x, y + 0.02, z], size: 0.14 })
    this.pointLight({ id: `${id}-light`, at: [x, y + 0.1, z], color, intensity: opts.intensity ?? 8.5, distance: opts.distance ?? 8, castShadow: opts.castShadow ?? true, flicker: { amount: 0.35, speed: 9 } })
  }

  /** Emissive layered-cone flame. Not solid; doesn't block rays. */
  flame(opts: { id: string; name?: string; at: Vec3; size?: number; seed?: number }): SceneObject {
    const obj: SceneObject = {
      id: opts.id,
      name: opts.name ?? 'Flame',
      mesh: { kind: 'flame', size: opts.size ?? 0.22, seed: opts.seed ?? Math.random() * 10 },
      transform: { position: opts.at, rotation: [0, 0, 0], scale: [1, 1, 1] },
      isSolid: false,
      castShadow: false,
      receiveShadow: false,
    }
    this.push(obj)
    return obj
  }

  /**
   * Readable (note / scrap / book spine). Default-oriented like a sheet on
   * the floor; set rotationY to turn it. For wall-mounted notes, place the
   * long edge against the wall and rotate 90°.
   */
  readable(opts: {
    id: string
    at: Vec3
    size: Vec3
    text: string
    color?: string
    rotationY?: number
    name?: string
    isSolid?: boolean
  }): SceneObject {
    return this.box({
      id: opts.id,
      name: opts.name ?? 'Note',
      at: opts.at,
      size: opts.size,
      color: opts.color ?? '#e8d9b0',
      roughness: 0.95,
      rotationY: opts.rotationY,
      isSolid: opts.isSolid ?? false,
      castShadow: false,
      interact: { behavior: { type: 'readable', text: opts.text } },
    })
  }

  /**
   * Pickup item. Mesh can be either a preset ('key') or an explicit size+color
   * description.
   */
  pickup(opts: {
    id: string
    at: Vec3
    itemId: string
    label: string
    icon?: string
    mesh: 'key' | { shape: PrimitiveShape; size: Vec3; color: string; metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }
    rotationY?: number
  }): SceneObject {
    const mesh = opts.mesh === 'key'
      ? { shape: 'cylinder' as const, size: [0.08, 0.02, 0.08] as Vec3, color: '#d4a042', metalness: 0.8, roughness: 0.3, emissive: '#f3c766', emissiveIntensity: 0.4 }
      : opts.mesh
    return this.primitive(mesh.shape, {
      id: opts.id,
      name: opts.label,
      at: opts.at,
      size: mesh.size,
      color: mesh.color,
      roughness: mesh.roughness ?? 0.8,
      metalness: mesh.metalness ?? 0,
      emissive: mesh.emissive,
      emissiveIntensity: mesh.emissiveIntensity,
      rotationY: opts.rotationY,
      castShadow: true,
      interact: {
        behavior: { type: 'pickup', itemId: opts.itemId, label: opts.label, icon: opts.icon },
      },
    })
  }

  /**
   * Oaken chest with a code-locked lid. The lid tilts back on a hinge when
   * the correct code is entered. Place any `pickup()` inside at a y around
   * `at.y + 0.42` so the closed lid occludes the ray to it (physical lock).
   */
  codedChest(opts: {
    id?: string
    at: Vec3 // bottom-centre of chest body
    code: string
    size?: [number, number, number] // [w, h, d]; default [1.0, 0.6, 0.6]
    bodyColor?: string
    lidColor?: string
    lockedMessage?: string
    stateId?: string
  }) {
    const id = opts.id ?? this.uid('chest')
    const [sw, sh, sd] = opts.size ?? [1.0, 0.6, 0.6]
    const [x, y, z] = opts.at
    const stateId = opts.stateId ?? `${id}-open`
    const bodyColor = opts.bodyColor ?? '#3a2010'
    const t = 0.06 // wall thickness — thick enough to read as oak staves

    // Hollow body: floor + four walls. Interior is visible when the lid tilts
    // back. Any pickup placed at y + t + (item half-height) rests on the floor.
    this.box({ id: `${id}-floor`, name: 'Chest floor', at: [x, y + t / 2, z], size: [sw, t, sd], color: bodyColor, roughness: 0.85, metalness: 0.1, isSolid: true })
    this.box({ id: `${id}-wall-front`, name: 'Chest wall (front)', at: [x, y + sh / 2, z + sd / 2 - t / 2], size: [sw, sh, t], color: bodyColor, roughness: 0.8, metalness: 0.1, isSolid: true })
    this.box({ id: `${id}-wall-back`, name: 'Chest wall (back)', at: [x, y + sh / 2, z - sd / 2 + t / 2], size: [sw, sh, t], color: bodyColor, roughness: 0.8, metalness: 0.1, isSolid: true })
    this.box({ id: `${id}-wall-left`, name: 'Chest wall (left)', at: [x - sw / 2 + t / 2, y + sh / 2, z], size: [t, sh, sd - 2 * t], color: bodyColor, roughness: 0.8, metalness: 0.1, isSolid: true })
    this.box({ id: `${id}-wall-right`, name: 'Chest wall (right)', at: [x + sw / 2 - t / 2, y + sh / 2, z], size: [t, sh, sd - 2 * t], color: bodyColor, roughness: 0.8, metalness: 0.1, isSolid: true })

    this.box({ id: `${id}-trim`, name: 'Chest trim', at: [x, y + sh / 2, z + sd / 2 + 0.015], size: [sw + 0.02, 0.08, 0.04], color: '#8a6a30', roughness: 0.4, metalness: 0.7, emissive: '#2a1a08', emissiveIntensity: 0.4 })
    this.box({ id: `${id}-lock`, name: 'Chest lock', at: [x, y + sh / 2 + 0.12, z + sd / 2 + 0.015], size: [0.14, 0.14, 0.03], color: '#c9972f', roughness: 0.3, metalness: 0.85, emissive: '#3a2a0a', emissiveIntensity: 0.6 })

    // Lid: pivot on the back edge. Compute open pose by hand so renaming
    // doesn't drift from the schema.
    const lidTopY = y + sh + 0.05
    const lidThickness = 0.1
    const hingeY = y + sh + lidThickness / 2
    const hingeZ = z - sd / 2
    const halfD = sd / 2
    const angle = -1.22 // ≈-70°
    const openY = hingeY + halfD * Math.sin(-angle)
    const openZ = hingeZ + halfD * Math.cos(-angle)

    this.box({
      id: `${id}-lid`,
      name: 'Chest lid',
      at: [x, lidTopY, z],
      size: [sw, lidThickness, sd],
      color: opts.lidColor ?? '#4a2a16',
      roughness: 0.75,
      metalness: 0.1,
      pose: {
        stateId,
        open: { position: [x, openY, openZ], rotation: [angle, 0, 0] },
        duration: 0.9,
      },
      interact: {
        lock: {
          requires: { kind: 'code', code: opts.code },
          lockedMessage: opts.lockedMessage ?? 'A heavy brass dial. It wants a three-digit code.',
          consumeItem: false,
        },
        behavior: { type: 'setState', stateId, value: true },
      },
    })
  }

  /**
   * Door + brass frame, locked by an inventory key item. If `exit` is true,
   * the door is registered as the level's exit (interacting after unlock
   * triggers win).
   */
  keyedDoor(opts: {
    id?: string
    at: Vec3 // bottom-centre of door
    size?: [number, number] // [width, height], default [1.1, 2.3]
    keyItemId: string
    color?: string
    frameColor?: string
    lockedMessage?: string
    rotationY?: number
    exit?: boolean
  }) {
    const id = opts.id ?? 'exit-door'
    const [sw, sh] = opts.size ?? [1.1, 2.3]
    const [x, y, z] = opts.at
    const halfW = sw / 2
    const frameH = sh + 0.15
    const frameColor = opts.frameColor ?? '#c9972f'

    this.box({ id: `${id}-frame-left`, name: 'Door frame (L)', at: [x - halfW - 0.06, y + frameH / 2 - 0.075, z], size: [0.12, frameH, 0.18], color: frameColor, roughness: 0.35, metalness: 0.6, emissive: '#2a1a08', emissiveIntensity: 0.4, isSolid: true })
    this.box({ id: `${id}-frame-right`, name: 'Door frame (R)', at: [x + halfW + 0.06, y + frameH / 2 - 0.075, z], size: [0.12, frameH, 0.18], color: frameColor, roughness: 0.35, metalness: 0.6, emissive: '#2a1a08', emissiveIntensity: 0.4, isSolid: true })
    this.box({ id: `${id}-frame-top`, name: 'Door frame (top)', at: [x, y + frameH - 0.07, z], size: [sw + 0.28, 0.14, 0.18], color: frameColor, roughness: 0.35, metalness: 0.6, emissive: '#2a1a08', emissiveIntensity: 0.4, isSolid: true })

    this.box({
      id,
      name: 'Exit Door',
      at: [x, y + sh / 2, z],
      size: [sw, sh, 0.08],
      color: opts.color ?? '#6b1f1a',
      roughness: 0.55,
      metalness: 0.05,
      emissive: '#2a0806',
      emissiveIntensity: 0.6,
      isSolid: true,
      rotationY: opts.rotationY,
      interact: {
        lock: {
          requires: { kind: 'item', itemId: opts.keyItemId },
          lockedMessage: opts.lockedMessage ?? 'The door is locked. You need a key.',
          consumeItem: false,
        },
        behavior: { type: 'exit' },
      },
    })

    this.sphere({ id: `${id}-handle`, name: 'Door handle', at: [x + halfW - 0.15, y + sh / 2, z + 0.07], size: [0.07, 0.07, 0.07], color: '#f3c766', roughness: 0.2, metalness: 0.9, emissive: '#3a2a0a', emissiveIntensity: 0.5 })

    if (opts.exit !== false) this.setExit(id)
  }

  /**
   * Simple 4-leg wooden table.
   */
  table(opts: {
    id?: string
    at: Vec3 // bottom-centre
    top?: [number, number, number] // tabletop size [w, thickness, d]
    legHeight?: number
    topColor?: string
    legColor?: string
  }) {
    const id = opts.id ?? this.uid('table')
    const [tw, tt, td] = opts.top ?? [1.2, 0.08, 0.7]
    const lh = opts.legHeight ?? 0.75
    const [x, y, z] = opts.at
    const topY = y + lh + tt / 2
    const topColor = opts.topColor ?? '#4a2f1a'
    const legColor = opts.legColor ?? '#2e1d10'

    this.box({ id, name: 'Table', at: [x, topY, z], size: [tw, tt, td], color: topColor, roughness: 0.6, metalness: 0.05, isSolid: true })
    const inset = 0.08
    const legSize: Vec3 = [0.08, lh, 0.08]
    const halfW = tw / 2 - inset
    const halfD = td / 2 - inset
    this.box({ id: `${id}-leg-1`, name: 'Table leg 1', at: [x - halfW, y + lh / 2, z - halfD], size: legSize, color: legColor, roughness: 0.8 })
    this.box({ id: `${id}-leg-2`, name: 'Table leg 2', at: [x + halfW, y + lh / 2, z - halfD], size: legSize, color: legColor, roughness: 0.8 })
    this.box({ id: `${id}-leg-3`, name: 'Table leg 3', at: [x - halfW, y + lh / 2, z + halfD], size: legSize, color: legColor, roughness: 0.8 })
    this.box({ id: `${id}-leg-4`, name: 'Table leg 4', at: [x + halfW, y + lh / 2, z + halfD], size: legSize, color: legColor, roughness: 0.8 })
  }
}

export function defineLevel(meta: LevelMeta): Level {
  const L = new LevelBuilder()
  meta.build(L)
  const raw = {
    id: meta.id,
    name: meta.name,
    version: 1 as const,
    background: meta.background ?? '#0a0a0a',
    playerStart: {
      position: meta.playerStart.position,
      rotationY: meta.playerStart.rotationY ?? 0,
    },
    exitId: L.exitId(),
    lights: L.lights,
    objects: L.objects,
    initialState: {},
  }
  // Validate so authoring mistakes surface immediately on module load.
  return LevelSchema.parse(raw)
}
