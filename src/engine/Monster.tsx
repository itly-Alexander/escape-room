import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import faceUrl from '@/assets/monster-face.png'
import { GrowlVoice } from './growl'
import { computeAABB, type AABB } from './collision'
import { canSee, DETECT_RANGE, DETECT_RANGE_CROUCHED, pursuit, segmentHitsBox } from './pursuit'
import { playerMotion } from '@/play/playerMotion'
import { sfx } from './ambient'
import { useWorld } from '@/state/world'

// A gaunt, pale, shirtless creature: wasted torso with ribs and collarbones,
// a long thin neck, stretched arms, dark straight hair framing a deathly face
// with huge black-ringed eyes and a grin carved almost to the ears.
// Built from smooth displaced primitives with procedurally painted skin, in a
// local frame with the feet at y=0 and the front facing +z. Placement and
// rotation come from the owning SceneObject.

// Pose: a crouched, spider-like crawl. The torso (modelled upright) is pitched
// forward around the hips; arms and legs are solved with two-bone IK so hands
// and feet plant on the floor with elbows and knees thrown up and outward.
const PITCH = 0.55
const HIP_OLD = new THREE.Vector3(0, 0.9, 0) // hip pivot in the upright torso's own coordinates
const WORLD_HIPS = new THREE.Vector3(0, 0.8, -0.24)
const UP_ROT = new THREE.Matrix4().makeRotationX(PITCH)
const upperPoint = (x: number, y: number, z: number) =>
  new THREE.Vector3(x - HIP_OLD.x, y - HIP_OLD.y, z - HIP_OLD.z).applyMatrix4(UP_ROT).add(WORLD_HIPS)

const NECK_BASE = upperPoint(0, 1.44, 0.02)
const HEAD_C = NECK_BASE.clone().add(new THREE.Vector3(0, -0.23, 0.2))
const HEAD_PIVOT: [number, number, number] = [HEAD_C.x, HEAD_C.y, HEAD_C.z]
const HEAD_TILT = new THREE.Euler(0.5, 0, 0.28) // cocked, staring down

// Scaled so the shoulders rise to this height, above the head, which hangs
// forward and low: a hunch. The pose below is sized to stay inside one 2 m
// maze cell after this scale is applied.
const TARGET_SHOULDER_Y = 2.35
const MONSTER_SCALE = TARGET_SHOULDER_Y / upperPoint(0, 1.39, 0.015).y

const ARM_UPPER = 0.58
const ARM_FORE = 0.58
const LEG_UPPER = 0.46
const LEG_LOWER = 0.46

function solveTwoBone(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = target.clone().sub(root)
  const dist = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d.length()))
  const dir = d.normalize()
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  const poleDir = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize()
  const elbow = root.clone().addScaledVector(dir, along).addScaledVector(poleDir, h)
  const end = root.clone().addScaledVector(dir, dist)
  return { elbow, end }
}

// Head ellipsoid radii (metres).
const HEAD_R: [number, number, number] = [0.085, 0.118, 0.098]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const gauss = (dx: number, dy: number, sx: number, sy: number) =>
  Math.exp(-((dx * dx) / (2 * sx * sx) + (dy * dy) / (2 * sy * sy)))

function finishTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function newCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return { canvas, ctx: canvas.getContext('2d')! }
}

// ---- Textures -------------------------------------------------------------

/** Mottled, slightly bruised pale skin for limbs/neck. */
function makeSkinTexture(seed: number) {
  const W = 256
  const H = 256
  const { canvas, ctx } = newCanvas(W, H)
  const rand = mulberry32(seed)
  ctx.fillStyle = 'rgb(150, 146, 140)'
  ctx.fillRect(0, 0, W, H)
  // Large soft blotches: bruising / uneven blood flow.
  for (let i = 0; i < 40; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 14 + rand() * 40
    const cold = rand() < 0.6
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r)
      g.addColorStop(0, cold ? 'rgba(90, 96, 110, 0.18)' : 'rgba(120, 80, 76, 0.14)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2)
    }
  }
  // Fine pores / grain.
  for (let i = 0; i < 5000; i++) {
    const l = rand() < 0.5 ? 0 : 255
    ctx.fillStyle = `rgba(${l},${l},${l},${0.03 + rand() * 0.06})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1)
  }
  // Faint blue-grey veins running along the limb.
  ctx.strokeStyle = 'rgba(70, 82, 104, 0.22)'
  for (let i = 0; i < 6; i++) {
    ctx.lineWidth = 1 + rand() * 1.5
    ctx.beginPath()
    let x = rand() * W
    ctx.moveTo(x, 0)
    for (let y = 0; y <= H; y += 16) {
      x += (rand() - 0.5) * 10
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return finishTexture(canvas)
}

/**
 * Emaciated torso, front-centred at u=0.5. v follows world height between
 * `y0` and `y1`. Shows collarbones, a hollow sternum and a ribcage.
 */
const TORSO_Y0 = 0.88
const TORSO_Y1 = 1.46
function makeTorsoTexture() {
  const W = 512
  const H = 512
  const { canvas, ctx } = newCanvas(W, H)
  const rand = mulberry32(3)
  const U = (x: number) => (0.5 + x / 0.82) * W // metres from centreline → px (circumference ≈ 0.82 m)
  const V = (y: number) => (1 - (y - TORSO_Y0) / (TORSO_Y1 - TORSO_Y0)) * H

  ctx.fillStyle = 'rgb(154, 150, 144)'
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 40; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 20 + rand() * 50
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rand() < 0.6 ? 'rgba(90, 96, 112, 0.16)' : 'rgba(120, 82, 78, 0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const stroke = (pts: [number, number][], color: string, width: number, blur = 3) => {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = blur
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(U(x), V(y)) : ctx.moveTo(U(x), V(y))))
    ctx.stroke()
    ctx.restore()
  }

  // Collarbones.
  for (const s of [-1, 1]) {
    stroke([[s * 0.012, 1.405], [s * 0.05, 1.415], [s * 0.1, 1.405], [s * 0.145, 1.39]], 'rgba(50,46,54,0.5)', 5)
    stroke([[s * 0.012, 1.417], [s * 0.05, 1.427], [s * 0.1, 1.417]], 'rgba(220,216,208,0.28)', 3)
  }
  // Sternum hollow.
  stroke([[0, 1.39], [0, 1.2]], 'rgba(50,46,54,0.28)', 8, 6)
  // Ribs: arcs sweeping out and down from the sternum, shadow under, light on top.
  for (let i = 0; i < 7; i++) {
    const y = 1.32 - i * 0.032
    for (const s of [-1, 1]) {
      stroke([[s * 0.01, y], [s * 0.055, y - 0.006], [s * 0.1, y - 0.022], [s * 0.135, y - 0.05]], 'rgba(46,42,50,0.52)', 5)
      stroke([[s * 0.01, y + 0.011], [s * 0.055, y + 0.005], [s * 0.1, y - 0.011]], 'rgba(222,218,210,0.2)', 3)
    }
  }
  // Hollow belly under the ribcage; navel.
  const belly = ctx.createRadialGradient(U(0), V(1.0), 0, U(0), V(1.0), 90)
  belly.addColorStop(0, 'rgba(40,36,44,0.3)')
  belly.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = belly
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(30,22,26,0.7)'
  ctx.beginPath()
  ctx.ellipse(U(0), V(1.02), 4, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  // Nipples.
  ctx.fillStyle = 'rgba(100,70,70,0.55)'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(U(s * 0.058), V(1.285), 5, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // Grain.
  for (let i = 0; i < 8000; i++) {
    const l = rand() < 0.5 ? 0 : 255
    ctx.fillStyle = `rgba(${l},${l},${l},${0.03 + rand() * 0.06})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1)
  }
  return finishTexture(canvas)
}

/** Dark, filthy trousers. */
function makeClothTexture() {
  const W = 256
  const H = 256
  const { canvas, ctx } = newCanvas(W, H)
  const rand = mulberry32(31)
  ctx.fillStyle = 'rgb(38, 38, 40)'
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 3500; i++) {
    const l = rand() < 0.5 ? 0 : 255
    ctx.fillStyle = `rgba(${l},${l},${l},${0.03 + rand() * 0.06})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 1)
  }
  for (let i = 0; i < 40; i++) {
    const x = rand() * W
    const y = H * (1 - Math.pow(rand(), 1.8))
    const r = 8 + rand() * 30
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r)
      g.addColorStop(0, 'rgba(48, 36, 24, 0.55)')
      g.addColorStop(1, 'rgba(48, 36, 24, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2)
    }
  }
  return finishTexture(canvas)
}

// The face is a photo-style painting (src/assets/monster-face.png), levelled
// and cropped so it covers head-local x∈[-0.1,0.1], y∈[-0.13,0.13], projected
// straight along z. Eyes sit at x=±0.034, y=0.014 and the mouth at y≈-0.06 to
// line up with the geometry's sockets and nose.
const FACE_W = 0.2
const FACE_H = 0.26

function loadFaceTexture() {
  const tex = new THREE.TextureLoader().load(faceUrl)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// ---- Geometry -------------------------------------------------------------

/** Tapered limb segment, rounded at both ends, centred on the origin (y up). */
function limbGeometry(r0: number, r1: number, len: number, segs = 12) {
  // r0 at the top (+y), r1 at the bottom (-y). Points run bottom → top so the
  // lathe's normals face outward.
  const h = len / 2
  const cap = (r: number) => r * 0.85
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0001, -h - cap(r1)),
    new THREE.Vector2(r1 * 0.55, -h - cap(r1) * 0.82),
    new THREE.Vector2(r1 * 0.9, -h - cap(r1) * 0.35),
    new THREE.Vector2(r1, -h),
    new THREE.Vector2((r0 + r1) * 0.5 * 1.04, 0), // slight bulge — sinew
    new THREE.Vector2(r0, h),
    new THREE.Vector2(r0 * 0.9, h + cap(r0) * 0.35),
    new THREE.Vector2(r0 * 0.55, h + cap(r0) * 0.82),
    new THREE.Vector2(0.0001, h + cap(r0)),
  ]
  return new THREE.LatheGeometry(pts, segs)
}

/**
 * Skeletal torso: narrow waist, ribcage with ridges, sloped shoulders, a
 * flat sternum groove and a visible spine. Front-centred at u=0.5; v follows
 * height (see TORSO_Y0/Y1) so the painted ribs line up.
 */
function buildTorsoGeometry() {
  const profile: [number, number][] = [
    [0.118, 0.88],
    [0.108, 0.96],
    [0.1, 1.04],
    [0.112, 1.12],
    [0.128, 1.22],
    [0.138, 1.31],
    [0.142, 1.37],
    [0.11, 1.42],
    [0.06, 1.455],
    [0.04, 1.46],
  ]
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    48,
  )
  geo.rotateY(Math.PI) // front (+z) now sits at u = 0.5
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    const y = pos.getY(i)
    let z = pos.getZ(i)
    x *= 1 + 0.26 * smoothstep(1.22, 1.4, y) // sloped, wide shoulders
    z *= 0.62 // flat, narrow front-to-back
    const front = z > 0
    // Rib ridges (front and sides).
    if (y > 1.08 && y < 1.34) {
      const ridge = 0.5 + 0.5 * Math.sin(((y - 1.08) / 0.032) * Math.PI * 2)
      const k = 1 + (0.03 * ridge * smoothstep(1.08, 1.14, y) * (1 - smoothstep(1.3, 1.34, y)))
      x *= k
      z *= k
    }
    // Sternum groove and spine ridge.
    if (front) z -= 0.007 * gauss(x, 0, 0.012, 1) * smoothstep(1.15, 1.3, y)
    else z -= 0.006 * gauss(x, 0, 0.01, 1) * smoothstep(0.95, 1.2, y)
    pos.setXYZ(i, x, y, z)
    uv.setY(i, (y - TORSO_Y0) / (TORSO_Y1 - TORSO_Y0))
  }
  geo.computeVertexNormals()
  return geo
}

/** Skull, hollow cheeks, long nose and narrow chin; planar-projected UVs. */
function buildHeadGeometry() {
  const geo = new THREE.SphereGeometry(1, 72, 54)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const [rx, ry, rz] = HEAD_R
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * rx
    let y = pos.getY(i) * ry
    let z = pos.getZ(i) * rz

    // Long, narrow jaw tapering to a pointed chin.
    if (y < 0) {
      const t = Math.pow(Math.min(1, -y / ry), 1.15)
      x *= 1 - 0.3 * t
      z *= 1 - 0.14 * t
      y *= 1 + 0.07 * t
    }
    // A flatter face plane.
    if (z > 0) z *= 0.93

    const f = smoothstep(0.015, 0.045, z) // front-only feature mask
    // Brow ridge and bridge, long nose with flared base.
    z += f * 0.011 * gauss(x, y - 0.04, 0.06, 0.012)
    z += f * 0.02 * gauss(x, y + 0.012, 0.0075, 0.03)
    z += f * 0.008 * gauss(x, y + 0.04, 0.016, 0.01)
    // Cheekbones up, cheeks hollowed.
    for (const s of [-1, 1]) {
      z += f * 0.006 * gauss(x - s * 0.058, y + 0.006, 0.02, 0.016)
      z -= f * 0.01 * gauss(x - s * 0.052, y + 0.05, 0.026, 0.034)
      // Deep eye sockets.
      z -= f * 0.011 * gauss(x - s * 0.034, y - 0.014, 0.019, 0.017)
      // Temples.
      z -= f * 0.005 * gauss(x - s * 0.077, y - 0.01, 0.014, 0.04)
    }
    // Sunken mouth region, thin lips.
    z -= f * 0.004 * gauss(x, y + 0.062, 0.05, 0.022)
    // Pronounced chin.
    z += f * 0.007 * gauss(x, y + 0.1, 0.02, 0.014)

    pos.setXYZ(i, x, y, z)
    uv.setXY(i, x / FACE_W + 0.5, y / FACE_H + 0.5)
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * Straight, lank dark hair: roots on the crown, sides and back of the skull
 * (never the face), hanging to the shoulders as thin tapered tubes.
 */
function buildHairGeometry() {
  const rand = mulberry32(7)
  const SIDES = 4
  const RINGS = 14
  const positions: number[] = []
  const indices: number[] = []
  const count = 340

  for (let s = 0; s < count; s++) {
    // Roots must sit behind the head's vertical mid-plane once it's tilted:
    // hair hangs straight down, so anything rooted ahead of that would drape
    // over the face.
    const root = new THREE.Vector3()
    for (let tries = 0; tries < 60; tries++) {
      const theta = (rand() * 2 - 1) * Math.PI
      const elev = -0.3 + rand() * 1.8
      root
        .set(
          HEAD_R[0] * 1.07 * Math.cos(elev) * Math.sin(theta),
          HEAD_R[1] * 1.05 * Math.sin(elev),
          HEAD_R[2] * 1.07 * Math.cos(elev) * Math.cos(theta),
        )
        .applyEuler(HEAD_TILT)
      if (Math.abs(theta) > 1.25 && elev > -0.15 && root.z < 0.01) break
    }
    const worldY = HEAD_PIVOT[1] + root.y
    const bottom = 0.06 + rand() * 0.3
    const len = Math.max(0.15, worldY - bottom)
    const thick = rand() < 0.25 ? 0.0095 : 0.0055 + rand() * 0.002
    const ampX = 0.003 + rand() * 0.011
    const ampZ = 0.002 + rand() * 0.008
    const freq = 0.8 + rand() * 1.6
    const ph = rand() * Math.PI * 2
    // Hair hangs a touch outward so it clears the neck and shoulders.
    const out = Math.sign(root.x) * 0.03 * (0.4 + rand())
    const back = root.z < 0 ? -0.01 : 0

    const base = positions.length / 3
    for (let k = 0; k <= RINGS; k++) {
      const t = k / RINGS
      const cx = root.x + out * Math.sin(t * Math.PI * 0.6) + Math.sin(t * Math.PI * freq + ph) * ampX * t
      const cy = root.y - t * len
      const cz = root.z + back * t + Math.cos(t * Math.PI * freq * 0.8 + ph) * ampZ * t
      const rad = thick * (1 - 0.75 * t * t)
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2
        positions.push(cx + Math.cos(a) * rad, cy, cz + Math.sin(a) * rad)
      }
    }
    for (let k = 0; k < RINGS; k++) {
      for (let j = 0; j < SIDES; j++) {
        const a = base + k * SIDES + j
        const b = base + k * SIDES + ((j + 1) % SIDES)
        const c = a + SIDES
        const d = b + SIDES
        indices.push(a, c, b, b, c, d)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// ---- Parts ----------------------------------------------------------------

type Mats = {
  skin: THREE.MeshStandardMaterial
  torso: THREE.MeshStandardMaterial
  face: THREE.MeshStandardMaterial
  cloth: THREE.MeshStandardMaterial
  hair: THREE.MeshStandardMaterial
}

function Finger({ mats, x, lean, len, curl }: { mats: Mats; x: number; lean: number; len: number; curl: number }) {
  const l1 = len * 0.55
  const l2 = len * 0.45
  return (
    <group position={[x, -0.085, 0]} rotation={[-curl * 0.5, 0, lean]}>
      <mesh position={[0, -l1 / 2, 0]} geometry={limbGeometry(0.0072, 0.006, l1, 6)} material={mats.skin} castShadow />
      <group position={[0, -l1, 0]} rotation={[-curl, 0, 0]}>
        <mesh position={[0, -l2 / 2, 0]} geometry={limbGeometry(0.006, 0.0034, l2, 6)} material={mats.skin} castShadow />
      </group>
    </group>
  )
}

function Hand({ side, mats }: { side: 1 | -1; mats: Mats }) {
  return (
    <>
      <mesh position={[0, -0.045, 0]} scale={[1, 1.35, 0.4]} material={mats.skin} castShadow>
        <sphereGeometry args={[0.034, 14, 10]} />
      </mesh>
      <Finger mats={mats} x={-0.025} lean={0.1} len={0.125} curl={0.45} />
      <Finger mats={mats} x={-0.0085} lean={0.03} len={0.15} curl={0.5} />
      <Finger mats={mats} x={0.0085} lean={-0.03} len={0.145} curl={0.55} />
      <Finger mats={mats} x={0.025} lean={-0.1} len={0.115} curl={0.5} />
      <group position={[side * -0.032, -0.045, 0.004]} rotation={[-0.2, 0, side * 0.7]}>
        <mesh position={[0, -0.03, 0]} geometry={limbGeometry(0.0085, 0.006, 0.06, 6)} material={mats.skin} castShadow />
      </group>
    </>
  )
}

const UP = new THREE.Vector3(0, 1, 0)

/** A tapered limb segment running from `a` (thicker, r0) down to `b` (r1). */
function LimbBetween({
  a, b, r0, r1, material,
}: {
  a: THREE.Vector3
  b: THREE.Vector3
  r0: number
  r1: number
  material: THREE.Material
}) {
  const len = a.distanceTo(b)
  const geo = useMemo(() => limbGeometry(r0, r1, len), [r0, r1, len])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, a.clone().sub(b).normalize()), [a, b])
  const mid = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b])
  return <mesh position={mid} quaternion={quat} geometry={geo} material={material} castShadow />
}

// ---- The gait -------------------------------------------------------------------
// She crawls like a spider: opposite arm and leg step together (left arm with
// right leg, then right arm with left leg). A foot spends half the cycle planted,
// sliding back under the body as she moves forward, and half swinging forward
// off the ground to land ahead. All the numbers here are in the monster's own
// (unscaled) units.

/** Her walking state, shared by her four limbs. `phase` runs 0..1 once per full stride. */
type Gait = { phase: number; amp: number; run: number }

const STRIDE = 0.17 // how far a foot travels forward and back of its rest spot when walking
const RUN_STRIDE = 0.12 // extra stride at a full run: longer, reaching strides
const WALK_SPEED = 1.1 // m/s: a slow, stalking crawl
const RUN_SPEED = 3.0 // m/s: fast, but still slower than the player's sprint (4.2), so you can outrun her
const smoothUnit = (k: number) => k * k * (3 - 2 * k)

/** Where a foot is, given the cycle. `offset` shifts it half a cycle for the opposite limb. */
function footOffset(gait: Gait, offset: number, lift: number): { dz: number; dy: number } {
  const u = (gait.phase + offset) % 1
  const stride = (STRIDE + RUN_STRIDE * gait.run) * gait.amp
  // Running, a foot is planted for less than half the cycle, so all four limbs are
  // briefly in the air together: she bounds. Feet also lift higher.
  const duty = 0.5 - 0.13 * gait.run
  const high = lift * (1 + 1.1 * gait.run)
  if (u < duty) return { dz: stride * (1 - (2 * u) / duty), dy: 0 } // planted: slides back
  const k = (u - duty) / (1 - duty)
  return { dz: stride * (-1 + 2 * smoothUnit(k)), dy: high * gait.amp * Math.sin(Math.PI * k) } // swinging forward
}

/** Point a tapered limb mesh (modelled along y) from `a` to `b`. */
function aim(mesh: THREE.Object3D | null, a: THREE.Vector3, b: THREE.Vector3, q: THREE.Quaternion, d: THREE.Vector3) {
  if (!mesh) return
  mesh.position.addVectors(a, b).multiplyScalar(0.5)
  d.subVectors(a, b).normalize()
  mesh.quaternion.copy(q.setFromUnitVectors(UP, d))
}

function PosedArm({ side, mats, gait }: { side: 1 | -1; mats: Mats; gait: React.MutableRefObject<Gait> }) {
  const upperGeo = useMemo(() => limbGeometry(0.03, 0.02, ARM_UPPER), [])
  const foreGeo = useMemo(() => limbGeometry(0.02, 0.013, ARM_FORE), [])
  const shoulder = useMemo(() => upperPoint(side * 0.19, 1.39, 0.015), [side])
  const pole = useMemo(() => new THREE.Vector3(side * 0.6, 1, -1), [side])
  const rest = useMemo(() => new THREE.Vector3(side * 0.2, 0.1, 0.22), [side])
  const upper = useRef<THREE.Mesh>(null)
  const fore = useRef<THREE.Mesh>(null)
  const elbowBall = useRef<THREE.Mesh>(null)
  const hand = useRef<THREE.Group>(null)
  const tmp = useMemo(() => ({ target: new THREE.Vector3(), q: new THREE.Quaternion(), d: new THREE.Vector3() }), [])

  useFrame(() => {
    // Left arm with the right leg; right arm with the left leg.
    const { dz, dy } = footOffset(gait.current, side === 1 ? 0 : 0.5, 0.15)
    // Running, the arms reach further out ahead.
    tmp.target.set(rest.x, rest.y + dy, rest.z + dz + 0.1 * gait.current.run)
    const { elbow, end } = solveTwoBone(shoulder, tmp.target, ARM_UPPER, ARM_FORE, pole)
    aim(upper.current, shoulder, elbow, tmp.q, tmp.d)
    aim(fore.current, elbow, end, tmp.q, tmp.d)
    elbowBall.current?.position.copy(elbow)
    if (hand.current) {
      hand.current.position.copy(end)
      // The hand cocks up as it swings forward, then lays flat again.
      hand.current.rotation.set(-1.3 + dy * 3, side * 0.3, 0, 'YXZ')
    }
  })

  return (
    <>
      <mesh ref={upper} geometry={upperGeo} material={mats.skin} castShadow />
      <mesh ref={fore} geometry={foreGeo} material={mats.skin} castShadow />
      <mesh position={shoulder} material={mats.skin} castShadow>
        <sphereGeometry args={[0.032, 10, 8]} />
      </mesh>
      <mesh ref={elbowBall} material={mats.skin} castShadow>
        <sphereGeometry args={[0.021, 10, 8]} />
      </mesh>
      {/* Hand planted flat, fingers splayed forward and arched like claws */}
      <group ref={hand}>
        <Hand side={side} mats={mats} />
      </group>
    </>
  )
}

function PosedLeg({ side, mats, gait }: { side: 1 | -1; mats: Mats; gait: React.MutableRefObject<Gait> }) {
  const upperGeo = useMemo(() => limbGeometry(0.062, 0.044, LEG_UPPER), [])
  const lowerGeo = useMemo(() => limbGeometry(0.044, 0.033, LEG_LOWER), [])
  const hip = useMemo(() => upperPoint(side * 0.075, 0.82, 0), [side])
  const pole = useMemo(() => new THREE.Vector3(side * 0.1, 1, 0.9), [side])
  const rest = useMemo(() => new THREE.Vector3(side * 0.22, 0.07, -0.15), [side])
  const upper = useRef<THREE.Mesh>(null)
  const lower = useRef<THREE.Mesh>(null)
  const kneeBall = useRef<THREE.Mesh>(null)
  const foot = useRef<THREE.Mesh>(null)
  const tmp = useMemo(() => ({ target: new THREE.Vector3(), q: new THREE.Quaternion(), d: new THREE.Vector3() }), [])

  useFrame(() => {
    const { dz, dy } = footOffset(gait.current, side === 1 ? 0.5 : 0, 0.13)
    tmp.target.set(rest.x, rest.y + dy, rest.z + dz)
    const { elbow: knee, end: ankle } = solveTwoBone(hip, tmp.target, LEG_UPPER, LEG_LOWER, pole)
    aim(upper.current, hip, knee, tmp.q, tmp.d)
    aim(lower.current, knee, ankle, tmp.q, tmp.d)
    kneeBall.current?.position.copy(knee)
    if (foot.current) {
      foot.current.position.set(ankle.x, ankle.y - 0.04, ankle.z + 0.05)
      foot.current.rotation.set(-dy * 2.4, side * 0.7, 0, 'YXZ') // toes point down as it lifts
    }
  })

  return (
    <>
      <mesh ref={upper} geometry={upperGeo} material={mats.cloth} castShadow />
      <mesh ref={lower} geometry={lowerGeo} material={mats.cloth} castShadow />
      <mesh position={hip} material={mats.cloth} castShadow>
        <sphereGeometry args={[0.066, 10, 8]} />
      </mesh>
      <mesh ref={kneeBall} material={mats.cloth} castShadow>
        <sphereGeometry args={[0.046, 10, 8]} />
      </mesh>
      <mesh ref={foot} scale={[1, 0.55, 2.7]} material={mats.skin} castShadow>
        <sphereGeometry args={[0.036, 14, 10]} />
      </mesh>
    </>
  )
}

function Hair({ mat }: { mat: THREE.Material }) {
  const geo = useMemo(buildHairGeometry, [])
  const ref = useRef<THREE.Mesh>(null)
  // Slow drift, as if stirred by a draught nobody else feels.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.rotation.z = Math.sin(t * 0.6) * 0.01
      ref.current.rotation.x = Math.sin(t * 0.43 + 1) * 0.008
    }
  })
  return <mesh ref={ref} geometry={geo} material={mat} castShadow />
}

type Nav = { origin: [number, number]; cell: number; open: string[]; lanes: Array<[number, number, number, number]>; centres: number[] }
type Patrol = { points: Array<[number, number]>; speed: number; stops: number[]; nav?: Nav }
type Cell = [number, number]

/** The maze as a grid she can find her way across. */
function makeGrid(nav: Nav) {
  const rows = nav.open.length
  const cols = nav.open[0].length
  const open = nav.open.map((r) => [...r].map((ch) => ch === '.'))
  const lane = new Map(nav.lanes.map(([r, c, dx, dz]) => [`${r},${c}`, [dx, dz] as [number, number]]))
  const cellOf = (x: number, z: number): Cell => [
    Math.max(0, Math.min(rows - 1, Math.round((z - nav.origin[1]) / nav.cell))),
    Math.max(0, Math.min(cols - 1, Math.round((x - nav.origin[0]) / nav.cell))),
  ]
  /** World position of a cell's middle, off to one side where a table stands. */
  const centre = ([r, c]: Cell): [number, number] => {
    const l = lane.get(`${r},${c}`)
    return [nav.origin[0] + c * nav.cell + (l?.[0] ?? 0), nav.origin[1] + r * nav.cell + (l?.[1] ?? 0)]
  }
  /** The nearest open cell to a point (the point itself may be in a wall, or out in the study). */
  const nearestOpen = (x: number, z: number): Cell => {
    let best: Cell = [0, 0]
    let bd = Infinity
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!open[r][c]) continue
        const d = (nav.origin[0] + c * nav.cell - x) ** 2 + (nav.origin[1] + r * nav.cell - z) ** 2
        if (d < bd) {
          bd = d
          best = [r, c]
        }
      }
    }
    return best
  }
  /** Shortest walk of open cells (including both ends), or [] if there's none. */
  const path = (from: Cell, to: Cell): Cell[] => {
    const prev = new Map<number, number>()
    const id = ([r, c]: Cell) => r * cols + c
    const queue: Cell[] = [from]
    prev.set(id(from), -1)
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h]
      if (cur[0] === to[0] && cur[1] === to[1]) break
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = cur[0] + dr
        const c = cur[1] + dc
        if (r < 0 || c < 0 || r >= rows || c >= cols || !open[r][c] || prev.has(r * cols + c)) continue
        prev.set(r * cols + c, id(cur))
        queue.push([r, c])
      }
    }
    if (!prev.has(id(to))) return []
    const out: Cell[] = []
    for (let k = id(to); k !== -1; k = prev.get(k)!) out.push([Math.floor(k / cols), k % cols])
    return out.reverse()
  }
  return { cellOf, centre, nearestOpen, path }
}

/** Close enough (metres, on the floor) for her to grab the player. */
const CATCH_RANGE = 1.5

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function Monster({ patrol, walkInPlace }: { patrol?: Patrol; walkInPlace?: boolean }) {
  const body = useRef<THREE.Group>(null)
  const gait = useRef<Gait>({ phase: 0, amp: 0, run: 0 })
  // Where she is on her loop. The object sits at the first patrol point, and she
  // walks by moving the body about inside it.
  const nav = useRef({
    i: 0,
    x: patrol?.points[0][0] ?? 0,
    z: patrol?.points[0][1] ?? 0,
    yaw: 0,
    wait: 0,
    started: false,
    // What she's doing: walking her loop, running down the player, or walking back to the loop.
    mode: 'patrol' as 'patrol' | 'chase' | 'return' | 'flip',
    flipT: 0, // time since she reached the table she's overturning
    lunge: 0, // how far she's heaving forward, for the overturn
    route: [] as Cell[], // cells to walk through, the first being the one she's in
    step: 0, // index in `route` of the cell she's heading for
    repath: 0,
    backTo: 0, // patrol point she's returning to
  })
  const grid = useMemo(() => (patrol?.nav ? makeGrid(patrol.nav) : null), [patrol])
  // The hiding place she watched the player crawl into, if she did.
  const knowsHide = useRef<unknown>(null)
  const head = useRef<THREE.Group>(null)
  const headYaw = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const look = useRef({ yaw: 0, pitch: HEAD_TILT.x })
  const tmp = useMemo(() => new THREE.Vector3(), [])
  // What can block her view: every solid thing, except a door that's standing open.
  const sight = useMemo(() => {
    const solid = useWorld.getState().level?.objects.filter((o) => o.isSolid) ?? []
    const isDoor = (o: (typeof solid)[number]) => !!o.pose?.unblocksWhenOpen
    return {
      fixed: solid.filter((o) => !isDoor(o)).map(computeAABB),
      doors: solid.filter(isDoor).map((o) => ({ flag: o.pose!.stateId, box: computeAABB(o) })),
      key: '',
      boxes: [] as AABB[],
    }
  }, [])
  const eyeW = useMemo(() => new THREE.Vector3(), [])
  const facing = useMemo(() => new THREE.Vector3(), [])
  const headWorld = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  // A growl that comes from her head and fades out with distance.
  const growl = useRef<GrowlVoice | null>(null)
  const paused = useThree((s) => s.frameloop === 'demand')
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    const v = new GrowlVoice()
    v.start()
    growl.current = v
    const resume = () => v.resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      v.dispose()
      growl.current = null
    }
  }, [])
  // Frames stop while paused, so silence it as soon as that happens.
  useEffect(() => {
    if (paused) growl.current?.update({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 }, { x: 1e6, y: 0, z: 0 }, true)
  }, [paused])

  const mats = useMemo<Mats>(() => {
    const skinTex = makeSkinTexture(11)
    const torsoTex = makeTorsoTexture()
    const faceTex = loadFaceTexture()
    const clothTex = makeClothTexture()
    return {
      skin: new THREE.MeshStandardMaterial({ map: skinTex, bumpMap: skinTex, bumpScale: 0.5, roughness: 0.7 }),
      torso: new THREE.MeshStandardMaterial({ map: torsoTex, bumpMap: torsoTex, bumpScale: 0.9, roughness: 0.7 }),
      face: new THREE.MeshStandardMaterial({ map: faceTex, bumpMap: faceTex, bumpScale: 0.5, roughness: 0.6 }),
      cloth: new THREE.MeshStandardMaterial({ map: clothTex, bumpMap: clothTex, bumpScale: 1, roughness: 1 }),
      hair: new THREE.MeshStandardMaterial({ color: '#050404', roughness: 0.75, metalness: 0.05 }),
    }
  }, [])
  const torsoGeo = useMemo(buildTorsoGeometry, [])
  const headGeo = useMemo(buildHeadGeometry, [])
  const pelvisGeo = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0.13, 0.76],
          [0.14, 0.84],
          [0.125, 0.92],
          [0.112, 0.99],
          [0.108, 1.0],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        24,
      ),
    [],
  )

  // Barely-there idle: a slow sway and a head that drifts and twitches.
  // The head follows the player, but only within 180° (±90° of where she faces).
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    // Game over: she freezes and goes quiet while the jump scare plays.
    if (useWorld.getState().caught) {
      growl.current?.update({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 }, { x: 1e6, y: 0, z: 0 }, true)
      return
    }
    let walking = !!walkInPlace
    // In a chase she runs: ease towards a run when it starts, and back to a walk when it ends.
    const g0 = gait.current
    g0.run += ((pursuit.chasing ? 1 : 0) - g0.run) * (1 - Math.exp(-dt * 5))
    const baseSpeed = patrol?.speed ?? WALK_SPEED
    const speed = baseSpeed + (RUN_SPEED - baseSpeed) * g0.run
    if (body.current && patrol) {
      const n = nav.current
      const pts = patrol.points
      let moving = false
      if (!n.started) {
        // First step: face the way she's going.
        n.yaw = Math.atan2(pts[1][0] - n.x, pts[1][1] - n.z)
        n.started = true
      }

      /** Walk towards a point; true once she's there. */
      const walkTo = (tx: number, tz: number, stopAt = 0.05): boolean => {
        const dx = tx - n.x
        const dz = tz - n.z
        const dist = Math.hypot(dx, dz)
        if (dist <= stopAt + 1e-3) return true
        const step = Math.min(dist - stopAt, speed * dt)
        n.x += (dx / dist) * step
        n.z += (dz / dist) * step
        moving = true
        n.yaw += wrapAngle(Math.atan2(dx, dz) - n.yaw) * (1 - Math.exp(-dt * 5))
        return false
      }
      /** Follow `n.route` cell by cell. True when it's run out. */
      const followRoute = (): boolean => {
        while (n.step < n.route.length) {
          const [tx, tz] = grid!.centre(n.route[n.step])
          if (!walkTo(tx, tz)) return false
          n.step++
        }
        return true
      }

      // The chase starts the moment pursuit does, and ends when it does.
      if (grid && pursuit.chasing && (n.mode === 'patrol' || n.mode === 'return')) {
        n.mode = 'chase'
        n.route = []
        n.repath = 0
        n.wait = 0
      } else if (grid && !pursuit.chasing && n.mode === 'chase') {
        // Lost them: walk back to the nearest point on her loop and carry on from there.
        n.mode = 'return'
        const here = grid.cellOf(n.x, n.z)
        let best = -1
        let len = Infinity
        for (const idx of patrol.nav!.centres) {
          const p = grid.path(here, grid.cellOf(pts[idx][0], pts[idx][1]))
          if (p.length && p.length < len) {
            len = p.length
            best = idx
            n.route = p
          }
        }
        if (best < 0) {
          n.mode = 'patrol'
        } else {
          n.backTo = best
          n.step = 1
        }
      }

      // She watched them crawl under a table: run there and overturn it.
      {
        const w = useWorld.getState()
        const h = w.hide
        if (grid && n.mode === 'chase' && h?.spot.group && h.spot.approach && knowsHide.current === h.spot && h.phase !== 'leaving' && !w.flags[`flip-${h.spot.group}`]) {
          n.mode = 'flip'
          n.flipT = 0
          n.route = []
          n.repath = 0
        }
      }

      if (n.mode === 'flip' && grid) {
        const w = useWorld.getState()
        const h = w.hide
        const sp = h?.spot
        if (!h || !sp?.group || !sp.approach || knowsHide.current !== sp) {
          // They came out by themselves, or it's already done.
          n.mode = 'chase'
          n.flipT = 0
        } else {
          pursuit.seenFrame = true // she knows exactly where they are
          const [ax, , az] = sp.approach
          if (n.flipT === 0) {
            n.repath -= dt
            if (n.repath <= 0) {
              n.repath = 0.3
              n.route = grid.path(grid.cellOf(n.x, n.z), grid.nearestOpen(ax, az))
              n.step = n.route.length > 1 ? 1 : 0
            }
            if (followRoute()) walkTo(ax, az, 0.1)
          }
          if (n.flipT > 0 || Math.hypot(ax - n.x, az - n.z) < 0.3) {
            // At the table: face it, rear back, then heave it over.
            n.flipT += dt
            n.yaw += wrapAngle(Math.atan2(sp.deep[0] - n.x, sp.deep[2] - n.z) - n.yaw) * (1 - Math.exp(-dt * 8))
            n.lunge = Math.sin(Math.min(1, n.flipT / 0.8) * Math.PI) * 0.45
            if (n.flipT > 0.35 && !w.flags[`flip-${sp.group}`]) {
              w.setFlag(`flip-${sp.group}`, true)
              w.setHidePhase('leaving') // thrown out from under it
              sfx.play('crash')
            }
            // Thrown out from under the table with her standing over them: that's it.
            if (n.flipT > 1.0) w.setCaught(true)
            if (n.flipT > 1.3) {
              n.mode = 'chase'
              n.flipT = 0
              n.lunge = 0
              pursuit.lastSeen.x = camera.position.x
              pursuit.lastSeen.z = camera.position.z
            }
          }
        }
      } else if (n.mode === 'chase' && grid) {
        // Run to where she last saw them, working the way round walls as she goes.
        const goal = pursuit.lastSeen
        n.repath -= dt
        if (n.repath <= 0) {
          n.repath = 0.3
          n.route = grid.path(grid.cellOf(n.x, n.z), grid.nearestOpen(goal.x, goal.z))
          n.step = n.route.length > 1 ? 1 : 0
        }
        const close = Math.hypot(goal.x - n.x, goal.z - n.z) < 0.4
        if (!close) {
          if (followRoute()) walkTo(goal.x, goal.z, 0.3) // in their cell: the last stretch in a straight line, right into them
        } else {
          // On top of them: stand and glare.
          n.yaw += wrapAngle(Math.atan2(goal.x - n.x, goal.z - n.z) - n.yaw) * (1 - Math.exp(-dt * 6))
        }
      } else if (n.mode === 'return' && grid) {
        if (followRoute() && walkTo(pts[n.backTo][0], pts[n.backTo][1])) {
          n.i = n.backTo
          n.mode = 'patrol'
        }
      } else {
        const next = pts[(n.i + 1) % pts.length]
        if (n.wait > 0) {
          n.wait -= dt
        } else if (walkTo(next[0], next[1])) {
          n.i = (n.i + 1) % pts.length
          // She stops and listens at some of the corners.
          if (patrol.stops.includes(n.i)) n.wait = 2 + Math.random() * 3
        }
      }
      walking = moving
      // The body is positioned inside its parent, which has its own rotation.
      const parentYaw = body.current.parent?.rotation.y ?? 0
      const ox = n.x - pts[0][0]
      const oz = n.z - pts[0][1]
      const c = Math.cos(parentYaw)
      const s = Math.sin(parentYaw)
      body.current.rotation.order = 'YXZ'
      body.current.position.set(ox * c - oz * s, 0, ox * s + oz * c)
      body.current.rotation.y = n.yaw - parentYaw
      pursuit.monster.x = n.x
      pursuit.monster.z = n.z
      pursuit.monster.yaw = n.yaw
    }
    // Advance the gait. Her stride length sets the pace so her planted feet don't skate:
    // at speed v a foot cycle takes about 4·stride·scale / v seconds.
    {
      const g = gait.current
      g.amp += ((walking ? 1 : 0) - g.amp) * (1 - Math.exp(-dt * 6))
      g.phase = (g.phase + (speed / (4 * (STRIDE + RUN_STRIDE * g.run) * MONSTER_SCALE)) * g.amp * dt) % 1
    }
    if (body.current) {
      const g = gait.current
      const tau = Math.PI * 2
      // Her whole body heaves with each step: up and down, rolling and pitching a little.
      // Running she bounds harder, rolls more and drops her shoulders into a forward lean.
      const r = g.run
      body.current.position.y = (0.03 + 0.07 * r) * g.amp * (0.5 + 0.5 * Math.cos(2 * tau * g.phase))
      body.current.rotation.z = Math.sin(t * 0.5) * 0.012 + (0.035 + 0.03 * r) * g.amp * Math.sin(tau * g.phase)
      body.current.rotation.x = Math.sin(t * 0.8) * 0.01 + (0.02 + 0.04 * r) * g.amp * Math.cos(2 * tau * g.phase) + 0.2 * r * g.amp + nav.current.lunge
      body.current.worldToLocal(tmp.copy(camera.position))
      const dx = tmp.x - HEAD_PIVOT[0]
      const dz = tmp.z - HEAD_PIVOT[2]
      const dy = HEAD_PIVOT[1] - tmp.y
      const yawTarget = THREE.MathUtils.clamp(Math.atan2(dx, dz), -Math.PI / 2, Math.PI / 2)
      const pitchTarget = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), 0.3, 0.75)
      // Does she see the player? Anyone in her front 180° with nothing in the way,
      // unless they're curled up out of sight under a table.
      {
        const w = useWorld.getState()
        const key = sight.doors.map((d) => (w.flags[d.flag] ? '1' : '0')).join('')
        if (key !== sight.key || sight.boxes.length === 0) {
          sight.key = key
          sight.boxes = [...sight.fixed, ...sight.doors.filter((d) => !w.flags[d.flag]).map((d) => d.box)]
        }
        body.current.localToWorld(eyeW.set(...HEAD_PIVOT))
        body.current.getWorldDirection(facing)
        // Up close she notices you even from behind, but only with a clear line to you:
        // no walls or furniture in between. Crouching makes you quieter. Someone curled
        // up under a table is still safe.
        const near =
          Math.hypot(camera.position.x - eyeW.x, camera.position.z - eyeW.z) < (playerMotion.crouching ? DETECT_RANGE_CROUCHED : DETECT_RANGE) &&
          !segmentHitsBox(eyeW, camera.position, sight.boxes)
        const sees = near || canSee(eyeW, facing, camera.position, sight.boxes)
        // If she watches them crawl under a table, she'll remember where.
        if (w.hide?.phase === 'entering' && sees) knowsHide.current = w.hide.spot
        else if (!w.hide) knowsHide.current = null
        // She's on top of them and can see them: caught.
        if (
          patrol &&
          sees &&
          w.hide?.phase !== 'hidden' &&
          Math.hypot(camera.position.x - pursuit.monster.x, camera.position.z - pursuit.monster.z) < CATCH_RANGE
        ) {
          w.setCaught(true)
        }
        if (w.hide?.phase !== 'hidden' && sees) {
          pursuit.seenFrame = true
          pursuit.lastSeen.x = camera.position.x
          pursuit.lastSeen.z = camera.position.z
        }
      }
      if (growl.current) {
        body.current.localToWorld(headWorld.set(...HEAD_PIVOT))
        camera.getWorldDirection(fwd)
        growl.current.setAgitation(pursuit.chasing ? 1 : 0)
        growl.current.update(
          { x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: fwd.x, fy: fwd.y, fz: fwd.z },
          headWorld,
          pausedRef.current,
        )
      }
      const k = 1 - Math.exp(-dt * 3)
      look.current.yaw += (yawTarget - look.current.yaw) * k
      look.current.pitch += (pitchTarget - look.current.pitch) * k
    }
    if (headYaw.current) headYaw.current.rotation.y = look.current.yaw
    if (head.current) {
      const twitch = Math.sin(t * 9) * Math.sin(t * 0.9) > 0.93 ? 0.06 : 0
      head.current.rotation.x = look.current.pitch
      head.current.rotation.z = HEAD_TILT.z + Math.sin(t * 0.35) * 0.04 + twitch
    }
  })

  // Dev wallhack (F4): a flat red copy of every mesh that only draws where
  // something nearer hides it, so she shows through walls.
  const wallhack = useWorld((s) => s.debugFullbright)
  useEffect(() => {
    const root = body.current
    if (!wallhack || !root) return
    const mat = new THREE.MeshBasicMaterial({
      color: '#ff2a2a',
      transparent: true,
      opacity: 0.55,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
    })
    const meshes: THREE.Mesh[] = []
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
    })
    // Added after the walk: adding during it would visit the copies and copy those too, forever.
    const ghosts = meshes.map((m) => {
      const g = new THREE.Mesh(m.geometry, mat)
      g.renderOrder = 999
      m.add(g)
      return g
    })
    return () => {
      ghosts.forEach((g) => g.parent?.remove(g))
      mat.dispose()
    }
  }, [wallhack])

  useLayoutEffect(
    () => () => {
      Object.values(mats).forEach((m) => {
        m.map?.dispose()
        m.dispose()
      })
    },
    [mats],
  )

  return (
    <group ref={body} scale={MONSTER_SCALE}>
      {/* Torso and pelvis, modelled upright, pitched forward about the hips */}
      <group position={WORLD_HIPS} rotation={[PITCH, 0, 0]}>
        <group position={[-HIP_OLD.x, -HIP_OLD.y, -HIP_OLD.z]}>
          <mesh geometry={torsoGeo} material={mats.torso} castShadow />
          <mesh geometry={pelvisGeo} material={mats.cloth} castShadow />
        </group>
      </group>

      <PosedArm side={1} mats={mats} gait={gait} />
      <PosedArm side={-1} mats={mats} gait={gait} />
      <PosedLeg side={1} mats={mats} gait={gait} />
      <PosedLeg side={-1} mats={mats} gait={gait} />

      {/* Long thin neck craning up and forward */}
      <LimbBetween
        a={HEAD_C.clone().add(new THREE.Vector3(0, -0.06, -0.02))}
        b={NECK_BASE}
        r0={0.03}
        r1={0.038}
        material={mats.skin}
      />

      <group position={HEAD_PIVOT}>
       <group ref={headYaw}>
        <group ref={head} rotation={HEAD_TILT}>
          <mesh geometry={headGeo} material={mats.face} castShadow />
          {/* Ears */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.083, 0, -0.012]} scale={[0.3, 1, 0.65]} material={mats.skin}>
              <sphereGeometry args={[0.032, 10, 8]} />
            </mesh>
          ))}
          {/* Hair on the crown, sides and back; the face stays bare. */}
          <mesh scale={[HEAD_R[0] * 1.075, HEAD_R[1] * 1.06, HEAD_R[2] * 1.075]} material={mats.hair} castShadow>
            <sphereGeometry args={[1, 40, 28, Math.PI / 2 + 1.1, Math.PI * 2 - 2.2, 0, Math.PI * 0.62]} />
          </mesh>
          <mesh scale={[HEAD_R[0] * 1.075, HEAD_R[1] * 1.06, HEAD_R[2] * 1.075]} material={mats.hair} castShadow>
            <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.24]} />
          </mesh>
        </group>
        <Hair mat={mats.hair} />
       </group>
      </group>
    </group>
  )
}
