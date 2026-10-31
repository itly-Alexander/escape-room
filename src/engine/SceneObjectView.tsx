import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SceneObject, Mesh as MeshSchema, Material } from '@/schema/level'
import { useWorld } from '@/state/world'
import { Flame } from './Flame'
import { Monster } from './Monster'
import { TableCloth } from './TableCloth'
import { Lantern } from './Lantern'
import { IronKey } from './IronKey'
import { Puddle } from './Puddle'
import { getProceduralTexture } from './textures'

// World-space size (metres) covered by one tile of each named texture. The
// shared CanvasTexture keeps repeat (1, 1); boxes scale their own UVs to their
// size so bricks stay the same size on a 8m room wall and a 2m maze block
// (the brick tile is 4 × 8 bricks, i.e. ~0.5m × 0.25m bricks at 2m).
const TEXTURE_TILE_METRES: Record<string, number> = {
  brick: 2,
}

function resolveTexture(name: NonNullable<Material['texture']>): THREE.Texture {
  return getProceduralTexture(name)
}

const texturedBoxCache = new Map<string, THREE.BoxGeometry>()

function texturedBoxGeometry(size: [number, number, number], tile: number): THREE.BoxGeometry {
  const key = `${size.join(',')}@${tile}`
  const hit = texturedBoxCache.get(key)
  if (hit) return hit
  const [w, h, d] = size
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  // BoxGeometry emits 4 vertices per face in order +x, -x, +y, -y, +z, -z.
  const faceUV: [number, number][] = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ]
  faceUV.forEach(([u, v], f) => {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i
      uv.setXY(idx, (uv.getX(idx) * u) / tile, (uv.getY(idx) * v) / tile)
    }
  })
  texturedBoxCache.set(key, geo)
  return geo
}

const spinAxis = new THREE.Vector3()
const spinV = new THREE.Vector3()
const spinQ = new THREE.Quaternion()
const baseQ = new THREE.Quaternion()
const spinE = new THREE.Euler()

function primitiveGeometry(
  shape: 'box' | 'cylinder' | 'plane' | 'sphere',
  size: [number, number, number],
  texture?: Material['texture'],
) {
  switch (shape) {
    case 'box':
      // Tiling textures get world-scaled UVs; a one-off sheet (a letter) uses the plain 0..1 ones.
      if (texture && TEXTURE_TILE_METRES[texture]) return <primitive object={texturedBoxGeometry(size, TEXTURE_TILE_METRES[texture])} attach="geometry" />
      return <boxGeometry args={size} />
    case 'cylinder':
      return <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
    case 'plane':
      return <planeGeometry args={[size[0], size[2]]} />
    case 'sphere':
      return <sphereGeometry args={[size[0] / 2, 32, 16]} />
  }
}

function primMaterial(m: Material) {
  const map = m.texture ? resolveTexture(m.texture) : undefined
  return (
    <meshStandardMaterial
      color={m.color}
      roughness={m.roughness}
      metalness={m.metalness}
      emissive={m.emissive ?? '#000000'}
      emissiveIntensity={m.emissive ? m.emissiveIntensity : 0}
      map={map}
      alphaTest={m.cutout ? 0.5 : 0}
      side={m.cutout ? THREE.DoubleSide : THREE.FrontSide}
    />
  )
}

function renderMesh(mesh: MeshSchema, highlight?: boolean) {
  if (mesh.kind === 'primitive') {
    return {
      geometry: primitiveGeometry(mesh.shape, mesh.size, mesh.material.texture),
      material: highlight ? (
        <meshStandardMaterial
          color={mesh.material.color}
          roughness={mesh.material.roughness}
          metalness={mesh.material.metalness}
          emissive={'#ffaa33'}
          emissiveIntensity={0.6}
          map={mesh.material.texture ? resolveTexture(mesh.material.texture) : undefined}
        />
      ) : (
        primMaterial(mesh.material)
      ),
    }
  }
  return {
    geometry: <boxGeometry args={[0.5, 0.5, 0.5]} />,
    material: <meshStandardMaterial color="#ff00ff" wireframe />,
  }
}

function isFlame(mesh: MeshSchema): mesh is Extract<MeshSchema, { kind: 'flame' }> {
  return mesh.kind === 'flame'
}

/** Meshes that are their own React components rather than a primitive. */
function customMeshElement(mesh: MeshSchema) {
  if (mesh.kind === 'monster') return <Monster patrol={mesh.patrol} walkInPlace={mesh.walkInPlace} />
  if (mesh.kind === 'key') return <IronKey />
  if (mesh.kind === 'puddle') return <Puddle seed={mesh.seed} width={mesh.width} depth={mesh.depth} />
  if (mesh.kind === 'lantern') return <Lantern />
  if (mesh.kind === 'cloth') return <TableCloth tableSize={mesh.tableSize} side={mesh.side} spin={mesh.spin} color={mesh.color} />
  return null
}

/**
 * Renders just the geometry + material + plane-rotation fix for a mesh schema.
 * No world transform. Caller wraps this in a positioned group.
 */
export function MeshBody({
  mesh,
  castShadow = true,
  receiveShadow = true,
}: {
  mesh: MeshSchema
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const planeRotFix = useMemo(() => {
    if (mesh.kind !== 'primitive' || mesh.shape !== 'plane') return undefined
    return new THREE.Euler(-Math.PI / 2, 0, 0)
  }, [mesh])
  if (isFlame(mesh)) return <Flame size={mesh.size} seed={mesh.seed} />
  const custom = customMeshElement(mesh)
  if (custom) return custom
  const { geometry, material } = renderMesh(mesh)
  return (
    <group rotation={planeRotFix}>
      <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
        {geometry}
        {material}
      </mesh>
    </group>
  )
}

type Props = {
  object: SceneObject
  highlight?: boolean
  animatePose?: boolean
  onClick?: (e: THREE.Event) => void
  children?: ReactNode
}

/**
 * Renders one SceneObject. When animatePose is true (Play mode), mutates
 * the group each frame to lerp toward open/closed poses based on world flags.
 */
export function SceneObjectView({ object, highlight, animatePose, onClick, children }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const flameMesh = isFlame(object.mesh) ? object.mesh : null
  const customMesh = flameMesh ? null : customMeshElement(object.mesh)
  const meshEl = flameMesh || customMesh ? null : renderMesh(object.mesh, highlight)

  const planeRotFix = useMemo(() => {
    if (object.mesh.kind !== 'primitive' || object.mesh.shape !== 'plane') return undefined
    return new THREE.Euler(-Math.PI / 2, 0, 0)
  }, [object.mesh])

  const spin = useRef(0)
  useFrame((_, dt) => {
    if (!animatePose || !groupRef.current) return
    const pose = object.pose
    const base = object.transform
    const g = groupRef.current
    if (!pose) {
      g.position.set(...base.position)
      g.rotation.set(...base.rotation)
      return
    }
    const open = useWorld.getState().flags[pose.stateId] === true
    if (pose.spin) {
      // Turn about a vertical axis through the pivot, easing in and out.
      const goal = open ? 1 : 0
      const k = 1 - Math.exp(-dt / Math.max(0.05, pose.duration / 3))
      spin.current += (goal - spin.current) * k
      if (Math.abs(goal - spin.current) < 0.0005) spin.current = goal
      const t = spin.current
      const eased = t * t * (3 - 2 * t)
      const theta = pose.spin.angle * eased
      const [px, py, pz] = pose.spin.pivot
      const axis = pose.spin.axis
      spinAxis.set(axis?.[0] ?? 0, axis?.[1] ?? 1, axis?.[2] ?? 0).normalize()
      spinQ.setFromAxisAngle(spinAxis, theta)
      // Carry the object round the pivot, then slide it by `shift` as well.
      spinV.set(base.position[0] - px, base.position[1] - py, base.position[2] - pz).applyQuaternion(spinQ)
      const sh = pose.spin.shift
      g.position.set(px + spinV.x + (sh?.[0] ?? 0) * eased, py + spinV.y + (sh?.[1] ?? 0) * eased, pz + spinV.z + (sh?.[2] ?? 0) * eased)
      // The object's own orientation first, then the turn.
      g.quaternion.copy(spinQ).multiply(baseQ.setFromEuler(spinE.set(...base.rotation)))
      return
    }
    const target = open ? pose.open : base
    const alpha = 1 - Math.exp(-dt / Math.max(0.05, pose.duration / 3))
    g.position.x += (target.position[0] - g.position.x) * alpha
    g.position.y += (target.position[1] - g.position.y) * alpha
    g.position.z += (target.position[2] - g.position.z) * alpha
    g.rotation.x += (target.rotation[0] - g.rotation.x) * alpha
    g.rotation.y += (target.rotation[1] - g.rotation.y) * alpha
    g.rotation.z += (target.rotation[2] - g.rotation.z) * alpha
  })

  return (
    <group
      ref={groupRef}
      position={object.transform.position}
      rotation={object.transform.rotation}
      scale={object.transform.scale}
      userData={{ sceneObjectId: object.id }}
      onClick={onClick}
    >
      {flameMesh ? (
        <Flame size={flameMesh.size} seed={flameMesh.seed} />
      ) : customMesh ? (
        customMesh
      ) : (
        <group rotation={planeRotFix}>
          <mesh castShadow={object.castShadow} receiveShadow={object.receiveShadow}>
            {meshEl!.geometry}
            {meshEl!.material}
          </mesh>
        </group>
      )}
      {children}
    </group>
  )
}
