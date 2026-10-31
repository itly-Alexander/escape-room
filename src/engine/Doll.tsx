import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Mesh as MeshSchema } from '@/schema/level'
import { useWorld } from '@/state/world'
import { computeAABB, type AABB } from './collision'
import { segmentHitsBox } from './pursuit'
import { sfx } from './ambient'
import { DollAudio } from './dollAudio'
import { resetWatch, watch } from './watch'

// A life-size porcelain doll in a faded Victorian dress: glazed white skin with
// fine crazing and a crack running through one eye, glass eyes, auburn ringlets
// and ball joints at the shoulders, elbows, wrists and knees. Built from smooth
// primitives in a local frame with the feet at y=0 and the front facing +z, as a
// rig of joint groups so a pose is just a set of angles.
//
// The hunter moves only while nobody can see her. She's frozen in whatever pose
// she had the instant you look at her, and she takes a new one every time she
// moves, so each glance finds her somewhere else, doing something else.

type DollMesh = Extract<MeshSchema, { kind: 'doll' }>

// ---- Textures -------------------------------------------------------------

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

function newCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return { canvas, ctx: canvas.getContext('2d')! }
}

function finish(canvas: HTMLCanvasElement, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas)
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
  }
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

// The face covers head-local x∈[-0.1,0.1], y∈[-0.12,0.12], projected along z.
const FACE_W = 0.2
const FACE_H = 0.24
const EYE_X = 0.037
const EYE_Y = 0.012

/**
 * Paints the doll's face onto an S×S canvas. `scare` is how you see her when
 * she has you: the glass eyes gone to black hollows and her jaw broken open.
 */
function drawFace(ctx: CanvasRenderingContext2D, S: number, scare = false) {
  const rand = mulberry32(5)
  const px = (x: number) => (x / FACE_W + 0.5) * S
  const py = (y: number) => (0.5 - y / FACE_H) * S
  const m = (v: number) => (v / FACE_W) * S // metres → px

  // Glazed porcelain, a little warmer in the middle and greyer at the edges.
  const base = ctx.createRadialGradient(px(0), py(0), 0, px(0), py(0), S * 0.62)
  base.addColorStop(0, '#f3ece3')
  base.addColorStop(0.7, '#e6ddd2')
  base.addColorStop(1, '#bfb6ac')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)

  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(px(x), py(y), 0, px(x), py(y), m(r))
    g.addColorStop(0, color)
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'))
    ctx.fillStyle = g
    ctx.fillRect(px(x) - m(r), py(y) - m(r), m(r) * 2, m(r) * 2)
  }
  // Rouged cheeks, sunken shadows round the eyes.
  for (const s of [-1, 1]) {
    blob(s * 0.05, -0.035, 0.034, 'rgba(214,112,112,0.42)')
    blob(s * EYE_X, EYE_Y, 0.03, 'rgba(70,48,52,0.32)')
  }

  // Eyes: painted whites, big dark irises and a glint (glass eyes sit on top in 3D).
  for (const s of [-1, 1]) {
    const ex = px(s * EYE_X)
    const ey = py(EYE_Y)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, ey, m(0.021), m(0.014), 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = scare ? '#050202' : '#ece6da'
    ctx.fillRect(ex - m(0.03), ey - m(0.03), m(0.06), m(0.06))
    if (scare) {
      // Nothing behind them but the dark inside her head, and a pinprick of red.
      const glint = ctx.createRadialGradient(ex, ey + m(0.002), 0, ex, ey + m(0.002), m(0.005))
      glint.addColorStop(0, 'rgba(255,40,30,0.95)')
      glint.addColorStop(1, 'rgba(120,0,0,0)')
      ctx.fillStyle = glint
      ctx.fillRect(ex - m(0.01), ey - m(0.01), m(0.02), m(0.02))
    }
    const iris = ctx.createRadialGradient(ex, ey, 0, ex, ey, m(0.013))
    iris.addColorStop(0, '#1a0f0a')
    iris.addColorStop(0.45, '#2c1a10')
    iris.addColorStop(0.9, '#5a3a22')
    iris.addColorStop(1, '#1a0f0a')
    if (!scare) {
      ctx.fillStyle = iris
      ctx.beginPath()
      ctx.arc(ex, ey + m(0.002), m(0.0128), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#050303'
      ctx.beginPath()
      ctx.arc(ex, ey + m(0.002), m(0.006), 0, Math.PI * 2)
      ctx.fill()
    }
    // The upper lid's shadow across the top of the eye.
    const lid = ctx.createLinearGradient(0, ey - m(0.015), 0, ey - m(0.004))
    lid.addColorStop(0, 'rgba(40,24,20,0.7)')
    lid.addColorStop(1, 'rgba(40,24,20,0)')
    ctx.fillStyle = lid
    ctx.fillRect(ex - m(0.03), ey - m(0.03), m(0.06), m(0.03))
    ctx.restore()
    if (!scare) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(ex + s * m(0.004) - m(0.003), ey - m(0.003), m(0.0028), 0, Math.PI * 2)
      ctx.fill()
    }
    // Painted lid line and lashes, splayed upwards.
    ctx.strokeStyle = '#1e120c'
    ctx.lineCap = 'round'
    ctx.lineWidth = m(0.0028)
    ctx.beginPath()
    ctx.ellipse(ex, ey, m(0.022), m(0.0145), 0, Math.PI * 1.06, Math.PI * 1.94)
    ctx.stroke()
    ctx.lineWidth = m(0.0018)
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (1.12 + (i / 7) * 0.76)
      const x0 = ex + Math.cos(a) * m(0.022)
      const y0 = ey + Math.sin(a) * m(0.0145)
      const len = m(0.009 + 0.003 * Math.sin((i / 7) * Math.PI))
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 + Math.cos(a) * len * 0.6 + s * m(0.002), y0 + Math.sin(a) * len)
      ctx.stroke()
    }
    ctx.lineWidth = m(0.0011)
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.2 + (i / 5) * 0.6)
      const x0 = ex + Math.cos(a) * m(0.02)
      const y0 = ey + Math.sin(a) * m(0.013)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0 + Math.cos(a) * m(0.003), y0 + Math.sin(a) * m(0.006))
      ctx.stroke()
    }
    // Thin brows, raised at the inner end: a sad, fixed, surprised look.
    ctx.strokeStyle = 'rgba(70,40,26,0.85)'
    ctx.lineWidth = m(0.0022)
    ctx.beginPath()
    ctx.moveTo(px(s * 0.014), py(0.056))
    ctx.quadraticCurveTo(px(s * 0.036), py(0.062), px(s * 0.058), py(0.044))
    ctx.stroke()
  }

  // Nostrils and the shadow under the nose.
  ctx.fillStyle = 'rgba(110,60,60,0.55)'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(px(s * 0.0065), py(-0.03), m(0.0028), m(0.0018), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  blob(0, -0.038, 0.012, 'rgba(120,80,80,0.18)')

  if (scare) {
    // The jaw broken open: a jagged hole into the dark, edged with chipped glaze.
    const hole: Array<[number, number]> = [[-0.02, -0.054], [-0.008, -0.05], [0.0, -0.056], [0.01, -0.049], [0.022, -0.056], [0.026, -0.07], [0.016, -0.083], [0.01, -0.076], [0.002, -0.092], [-0.008, -0.08], [-0.018, -0.088], [-0.026, -0.068]]
    ctx.fillStyle = '#070303'
    ctx.beginPath()
    hole.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))))
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(250,244,234,0.85)'
    ctx.lineWidth = m(0.0014)
    ctx.stroke()
  }
  // A small, closed rosebud mouth.
  ctx.fillStyle = scare ? 'rgba(0,0,0,0)' : '#8a1e22'
  ctx.beginPath()
  ctx.moveTo(px(-0.016), py(-0.058))
  ctx.quadraticCurveTo(px(-0.008), py(-0.049), px(0), py(-0.053))
  ctx.quadraticCurveTo(px(0.008), py(-0.049), px(0.016), py(-0.058))
  ctx.quadraticCurveTo(px(0), py(-0.069), px(-0.016), py(-0.058))
  ctx.fill()
  ctx.strokeStyle = 'rgba(40,6,8,0.9)'
  ctx.lineWidth = m(0.0012)
  ctx.beginPath()
  ctx.moveTo(px(-0.015), py(-0.058))
  ctx.quadraticCurveTo(px(0), py(-0.056), px(0.015), py(-0.058))
  ctx.stroke()
  blob(-0.004, -0.061, 0.004, 'rgba(255,220,220,0.35)')

  // A dirty tear streak running from the left eye.
  const streak = ctx.createLinearGradient(0, py(EYE_Y - 0.012), 0, py(-0.08))
  streak.addColorStop(0, 'rgba(80,52,36,0.45)')
  streak.addColorStop(1, 'rgba(80,52,36,0)')
  ctx.strokeStyle = streak
  ctx.lineWidth = m(0.004)
  ctx.beginPath()
  ctx.moveTo(px(-EYE_X - 0.004), py(EYE_Y - 0.013))
  ctx.bezierCurveTo(px(-0.044), py(-0.02), px(-0.038), py(-0.05), px(-0.042), py(-0.085))
  ctx.stroke()

  // The crack: from the hairline down through the right eye and across the cheek.
  const crack: Array<[number, number]> = [[0.012, 0.125], [0.02, 0.09], [0.017, 0.07], [0.03, 0.045], [0.036, 0.028], [0.05, 0.004], [0.047, -0.02], [0.062, -0.045], [0.07, -0.075]]
  const drawCrack = (pts: Array<[number, number]>, w: number) => {
    ctx.lineJoin = 'miter'
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = m(w) * 1.8
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x) + 1, py(y) + 1) : ctx.moveTo(px(x) + 1, py(y) + 1)))
    ctx.stroke()
    ctx.strokeStyle = '#2a1a16'
    ctx.lineWidth = m(w)
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))))
    ctx.stroke()
  }
  drawCrack(crack, 0.0016)
  drawCrack([[0.03, 0.045], [0.048, 0.06], [0.06, 0.058], [0.075, 0.072]], 0.0011)
  drawCrack([[0.047, -0.02], [0.03, -0.035], [0.024, -0.05]], 0.001)
  drawCrack([[0.02, 0.09], [0.0, 0.1], [-0.012, 0.118]], 0.001)
  if (scare) {
    drawCrack([[-0.026, -0.068], [-0.045, -0.06], [-0.06, -0.075], [-0.085, -0.07]], 0.0014)
    drawCrack([[0.002, -0.092], [0.004, -0.11], [-0.006, -0.125]], 0.0014)
    drawCrack([[-0.012, 0.118], [-0.03, 0.08], [-0.028, 0.05], [-0.05, 0.035], [-0.075, 0.04]], 0.0012)
  }
  // A chip knocked out beside the eye, showing the dark hollow inside.
  ctx.fillStyle = '#1b100d'
  ctx.beginPath()
  ctx.moveTo(px(0.05), py(0.004))
  ctx.lineTo(px(0.059), py(0.012))
  ctx.lineTo(px(0.066), py(0.0))
  ctx.lineTo(px(0.061), py(-0.012))
  ctx.lineTo(px(0.052), py(-0.008))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(250,245,235,0.8)'
  ctx.lineWidth = m(0.0012)
  ctx.stroke()

  // Grime and fine crazing in the glaze.
  for (let i = 0; i < (scare ? 2600 : 260); i++) {
    ctx.fillStyle = `rgba(90,70,60,${0.03 + rand() * 0.08})`
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2)
  }
  ctx.strokeStyle = 'rgba(80,64,56,0.12)'
  ctx.lineWidth = Math.max(1, S / 700)
  for (let i = 0; i < 40; i++) {
    let x = rand() * S
    let y = rand() * S
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 4; k++) {
      x += (rand() - 0.5) * S * 0.06
      y += (rand() - 0.5) * S * 0.06
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/** Off-white glaze with fine crazing and a little grime, for her arms, legs and neck. */
function makeCrazeTexture() {
  const S = 256
  const { canvas, ctx } = newCanvas(S, S)
  const rand = mulberry32(17)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(90,76,66,0.16)'
  ctx.lineWidth = 1
  for (let i = 0; i < 70; i++) {
    let x = rand() * S
    let y = rand() * S
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 30
      y += (rand() - 0.5) * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  for (let i = 0; i < 30; i++) {
    const x = rand() * S
    const y = rand() * S
    const r = 6 + rand() * 20
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(120,96,80,0.12)')
    g.addColorStop(1, 'rgba(120,96,80,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  return finish(canvas)
}

/** Faded dusty-rose silk: pleat shading, a tiny sprigged pattern, stains rising from the hem. */
function makeDressTexture() {
  const W = 256
  const H = 256
  const { canvas, ctx } = newCanvas(W, H)
  const rand = mulberry32(29)
  ctx.fillStyle = '#7f5559'
  ctx.fillRect(0, 0, W, H)
  for (let x = 0; x < W; x++) {
    const v = Math.sin((x / W) * Math.PI * 2 * 10)
    ctx.fillStyle = v > 0 ? `rgba(255,230,230,${0.05 * v})` : `rgba(20,5,8,${-0.12 * v})`
    ctx.fillRect(x, 0, 1, H)
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(220,190,170,${0.12 + rand() * 0.12})`
    const x = rand() * W
    const y = rand() * H
    ctx.fillRect(x, y, 2, 2)
    ctx.fillRect(x + 2, y + 1, 1, 1)
  }
  for (let i = 0; i < 30; i++) {
    const x = rand() * W
    const y = H * (1 - Math.pow(rand(), 2))
    const r = 8 + rand() * 30
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r)
      g.addColorStop(0, 'rgba(50,30,20,0.4)')
      g.addColorStop(1, 'rgba(50,30,20,0)')
      ctx.fillStyle = g
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2)
    }
  }
  return finish(canvas)
}

let faceUrlCache: string | null = null
/** Her face as a picture, large, for the jump scare. */
export function dollFaceDataUrl(): string {
  if (faceUrlCache) return faceUrlCache
  const S = 1024
  const { canvas, ctx } = newCanvas(S, S)
  drawFace(ctx, S, true)
  // Darken towards the edges so it reads as a face pressed right up to yours.
  const v = ctx.createRadialGradient(S / 2, S * 0.46, S * 0.25, S / 2, S / 2, S * 0.72)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, S, S)
  faceUrlCache = canvas.toDataURL('image/png')
  return faceUrlCache
}

// ---- Materials and geometry (shared by every doll) --------------------------

type Mats = Record<'porcelain' | 'joint' | 'face' | 'dress' | 'lace' | 'hair' | 'shoe' | 'stocking' | 'eyeWhite' | 'iris' | 'pupil' | 'ribbon', THREE.Material>
let matsCache: Mats | null = null
function getMats(): Mats {
  if (matsCache) return matsCache
  const craze = makeCrazeTexture()
  const { canvas, ctx } = newCanvas(512, 512)
  drawFace(ctx, 512)
  const face = finish(canvas, false)
  const glaze = { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2 }
  matsCache = {
    porcelain: new THREE.MeshPhysicalMaterial({ color: '#efe7de', map: craze, ...glaze }),
    joint: new THREE.MeshPhysicalMaterial({ color: '#d8cfc3', map: craze, ...glaze }),
    face: new THREE.MeshPhysicalMaterial({ map: face, ...glaze, roughness: 0.35 }),
    dress: new THREE.MeshStandardMaterial({ map: makeDressTexture(), roughness: 0.88 }),
    lace: new THREE.MeshStandardMaterial({ color: '#d6cebf', roughness: 0.95 }),
    hair: new THREE.MeshStandardMaterial({ color: '#3d2116', roughness: 0.55 }),
    shoe: new THREE.MeshPhysicalMaterial({ color: '#0d0a0a', roughness: 0.3, clearcoat: 1 }),
    stocking: new THREE.MeshStandardMaterial({ color: '#cbc4b8', roughness: 0.9 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: '#e9e3d7', roughness: 0.08, clearcoat: 1 }),
    iris: new THREE.MeshPhysicalMaterial({ color: '#3a2212', roughness: 0.1, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: '#030202', roughness: 0.05, clearcoat: 1 }),
    ribbon: new THREE.MeshStandardMaterial({ color: '#4e1016', roughness: 0.65 }),
  }
  return matsCache
}

const HEAD_R: [number, number, number] = [0.1, 0.12, 0.105]

function buildHead() {
  const geo = new THREE.SphereGeometry(1, 56, 42)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  const [rx, ry, rz] = HEAD_R
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * rx
    let y = pos.getY(i) * ry
    const z = pos.getZ(i) * rz
    // Round, full cheeks narrowing to a small soft chin.
    if (y < -0.04) {
      const t = Math.min(1, (-y - 0.04) / 0.08)
      x *= 1 - 0.22 * t * t
    }
    if (y > 0.08) y *= 1.02
    pos.setXYZ(i, x, y, z)
    uv.setXY(i, x / FACE_W + 0.5, y / FACE_H + 0.5)
  }
  geo.computeVertexNormals()
  return geo
}

function lathe(profile: Array<[number, number]>, segs: number) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs)
}

/** A full skirt from the waist (y=0) to the hem, with pleats that deepen towards the bottom. */
function buildSkirt() {
  const geo = lathe([[0.104, 0.02], [0.13, -0.04], [0.2, -0.14], [0.27, -0.3], [0.32, -0.48], [0.345, -0.6], [0.35, -0.64]].reverse() as Array<[number, number]>, 72)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const t = Math.min(1, Math.max(0, -y / 0.64))
    const a = Math.atan2(x, z)
    const k = 1 + 0.045 * t * Math.sin(a * 18) + 0.02 * t * Math.sin(a * 7 + 1)
    pos.setXYZ(i, x * k, y, z * k)
  }
  geo.computeVertexNormals()
  return geo
}

type Geos = ReturnType<typeof buildGeos>
let geosCache: Geos | null = null
function buildGeos() {
  return {
    head: buildHead(),
    skirt: buildSkirt(),
    bodice: lathe([[0.04, 0.47], [0.1, 0.43], [0.13, 0.37], [0.138, 0.27], [0.118, 0.15], [0.1, 0.06], [0.104, 0]].reverse() as Array<[number, number]>, 40),
    upperArm: new THREE.CapsuleGeometry(0.03, 0.2, 4, 12),
    foreArm: new THREE.CapsuleGeometry(0.026, 0.19, 4, 12),
    thigh: new THREE.CapsuleGeometry(0.05, 0.32, 4, 12),
    shin: new THREE.CapsuleGeometry(0.038, 0.3, 4, 12),
    finger: new THREE.CapsuleGeometry(0.0075, 0.04, 3, 6),
    ball: new THREE.SphereGeometry(1, 16, 12),
    neck: new THREE.CylinderGeometry(0.036, 0.04, 0.1, 16),
    collar: new THREE.TorusGeometry(0.06, 0.018, 8, 28),
    hem: new THREE.TorusGeometry(0.352, 0.016, 6, 64),
    sash: new THREE.TorusGeometry(0.106, 0.016, 8, 32),
    ringlet: new THREE.CylinderGeometry(0.018, 0.009, 0.26, 8),
    hairBack: new THREE.SphereGeometry(1, 40, 28, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0, Math.PI * 0.64),
    hairTop: new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.27),
  }
}
function getGeos(): Geos {
  if (!geosCache) geosCache = buildGeos()
  return geosCache
}

// ---- The rig and its poses -----------------------------------------------------

/** Joint angles. Arms: [swing forward(-)/back(+), out to the side, elbow (negative bends forward)]. Legs: [hip (negative = forward), knee (positive bends back)]. */
type Pose = {
  hipY: number
  lean: number
  spine: [number, number, number]
  head: [number, number, number]
  armL: [number, number, number]
  armR: [number, number, number]
  legL: [number, number]
  legR: [number, number]
  skirt?: [number, number]
}

const POSES: Record<string, Pose> = {
  stand: { hipY: 0.92, lean: 0, spine: [0, 0, 0], head: [0.12, 0, 0.22], armL: [0.04, 0.08, -0.12], armR: [0.04, 0.08, -0.12], legL: [0, 0], legR: [0, 0] },
  sit: { hipY: 0.52, lean: 0, spine: [-0.06, 0, 0], head: [0.12, 0, 0.18], armL: [-0.45, 0.12, -1.0], armR: [-0.45, 0.12, -1.0], legL: [-1.5, 1.5], legR: [-1.5, 1.5], skirt: [0.62, 0.1] },
  slump: { hipY: 0.52, lean: 0, spine: [0.28, 0, 0.08], head: [0.72, 0.15, 0.5], armL: [0.12, 0.2, -0.2], armR: [0.0, 0.1, -0.5], legL: [-1.45, 1.4], legR: [-1.55, 1.55], skirt: [0.62, 0.1] },
  sitFloor: { hipY: 0.12, lean: 0, spine: [0.1, 0, 0], head: [0.25, 0.1, 0.3], armL: [-0.25, 0.3, -0.3], armR: [-0.15, 0.25, -0.5], legL: [-1.57, 0], legR: [-1.5, 0.05], skirt: [0.4, 0.18] },
  // The hunter's: never seen in motion, only these, held.
  creep: { hipY: 0.9, lean: 0.12, spine: [0.15, 0, 0], head: [0.3, 0.2, 0.62], armL: [-0.35, 0.12, -0.5], armR: [0.15, 0.1, -0.1], legL: [-0.35, 0.3], legR: [0.25, 0.15] },
  stalk: { hipY: 0.9, lean: 0.08, spine: [0.1, 0.1, 0], head: [0.45, -0.1, 0.1], armL: [0.5, 0.12, -0.3], armR: [0.5, 0.12, -0.3], legL: [0.2, 0.2], legR: [-0.3, 0.25] },
  broken: { hipY: 0.91, lean: 0.05, spine: [0.05, 0, -0.18], head: [0.25, 0.95, 1.35], armL: [-2.7, 0.25, 0], armR: [0.1, 0.05, 0], legL: [-0.15, 0.1], legR: [0.1, 0.1] },
  reach: { hipY: 0.89, lean: 0.22, spine: [0.2, 0, 0], head: [0.05, 0, -0.32], armL: [-1.45, 0.05, -0.1], armR: [-1.4, 0.02, -0.15], legL: [-0.4, 0.2], legR: [0.25, 0.18] },
  reachHigh: { hipY: 0.88, lean: 0.3, spine: [0.22, 0, 0.05], head: [-0.15, 0, 0.5], armL: [-2.15, 0.15, -0.2], armR: [-1.5, -0.05, -0.6], legL: [-0.5, 0.3], legR: [0.35, 0.2] },
  grab: { hipY: 0.86, lean: 0.42, spine: [0.25, 0, 0], head: [-0.25, 0, 0.18], armL: [-1.25, 0.4, -0.55], armR: [-1.2, 0.38, -0.5], legL: [-0.55, 0.45], legR: [0.4, 0.2] },
}

type Rig = {
  hips: THREE.Group | null
  spine: THREE.Group | null
  head: THREE.Group | null
  skirt: THREE.Group | null
  shL: THREE.Group | null
  elL: THREE.Group | null
  shR: THREE.Group | null
  elR: THREE.Group | null
  hipL: THREE.Group | null
  knL: THREE.Group | null
  hipR: THREE.Group | null
  knR: THREE.Group | null
  // Points to test whether any of her can be seen.
  marks: THREE.Object3D[]
}

function applyPose(rig: Rig, p: Pose) {
  rig.hips?.position.set(0, p.hipY, 0)
  rig.hips?.rotation.set(p.lean, 0, 0)
  rig.spine?.rotation.set(...p.spine)
  rig.head?.rotation.set(p.head[0], p.head[1], p.head[2], 'YXZ')
  rig.shL?.rotation.set(p.armL[0], 0, p.armL[1])
  rig.elL?.rotation.set(p.armL[2], 0, 0)
  rig.shR?.rotation.set(p.armR[0], 0, -p.armR[1])
  rig.elR?.rotation.set(p.armR[2], 0, 0)
  rig.hipL?.rotation.set(p.legL[0], 0, 0)
  rig.knL?.rotation.set(p.legL[1], 0, 0)
  rig.hipR?.rotation.set(p.legR[0], 0, 0)
  rig.knR?.rotation.set(p.legR[1], 0, 0)
  if (rig.skirt) {
    rig.skirt.scale.y = p.skirt?.[0] ?? 1
    rig.skirt.position.z = p.skirt?.[1] ?? 0
  }
}

/** A pose like `base`, but never quite the same twice. */
function jitter(base: Pose, amt: number): Pose {
  const j = () => (Math.random() - 0.5) * 2 * amt
  return {
    ...base,
    spine: [base.spine[0] + j() * 0.4, base.spine[1] + j() * 0.5, base.spine[2] + j() * 0.4],
    head: [base.head[0] + j(), base.head[1] + j() * 1.5, base.head[2] + j() * 1.5],
    armL: [base.armL[0] + j(), base.armL[1] + j() * 0.5, base.armL[2] + j()],
    armR: [base.armR[0] + j(), base.armR[1] + j() * 0.5, base.armR[2] + j()],
  }
}

function Hand({ mats, geos }: { mats: Mats; geos: Geos }) {
  return (
    <group position={[0, -0.235, 0]}>
      <mesh geometry={geos.ball} material={mats.joint} scale={0.022} castShadow />
      <mesh geometry={geos.ball} material={mats.porcelain} position={[0, -0.045, 0.004]} scale={[0.032, 0.042, 0.016]} castShadow />
      {[-0.018, -0.006, 0.006, 0.018].map((x, i) => (
        <mesh key={i} geometry={geos.finger} material={mats.porcelain} position={[x, -0.105 + Math.abs(x) * 0.6, 0.012]} rotation={[-0.25, 0, x * 2]} castShadow />
      ))}
      <mesh geometry={geos.finger} material={mats.porcelain} position={[0.03, -0.05, 0.02]} rotation={[-0.4, 0, 0.7]} scale={[1, 0.8, 1]} castShadow />
    </group>
  )
}

function Arm({ side, rig, mats, geos }: { side: 1 | -1; rig: React.MutableRefObject<Rig>; mats: Mats; geos: Geos }) {
  const L = side === 1
  return (
    <group ref={(g) => { rig.current[L ? 'shL' : 'shR'] = g }} position={[side * 0.17, 0.38, -0.005]}>
      {/* Puffed sleeve over the ball joint */}
      <mesh geometry={geos.ball} material={mats.dress} scale={[0.068, 0.07, 0.068]} position={[side * 0.01, -0.02, 0]} castShadow />
      <mesh geometry={geos.upperArm} material={mats.porcelain} position={[0, -0.14, 0]} castShadow />
      <group ref={(g) => { rig.current[L ? 'elL' : 'elR'] = g }} position={[0, -0.27, 0]}>
        <mesh geometry={geos.ball} material={mats.joint} scale={0.031} castShadow />
        <mesh geometry={geos.foreArm} material={mats.porcelain} position={[0, -0.12, 0]} castShadow />
        <Hand mats={mats} geos={geos} />
        <object3D ref={(o) => { if (o) rig.current.marks[L ? 3 : 4] = o }} position={[0, -0.28, 0]} />
      </group>
    </group>
  )
}

function Leg({ side, rig, mats, geos }: { side: 1 | -1; rig: React.MutableRefObject<Rig>; mats: Mats; geos: Geos }) {
  const L = side === 1
  return (
    <group ref={(g) => { rig.current[L ? 'hipL' : 'hipR'] = g }} position={[side * 0.075, -0.04, 0]}>
      <mesh geometry={geos.thigh} material={mats.stocking} position={[0, -0.2, 0]} castShadow />
      <group ref={(g) => { rig.current[L ? 'knL' : 'knR'] = g }} position={[0, -0.42, 0]}>
        <mesh geometry={geos.ball} material={mats.joint} scale={0.046} castShadow />
        <object3D ref={(o) => { if (o) rig.current.marks[L ? 5 : 6] = o }} />
        <mesh geometry={geos.shin} material={mats.stocking} position={[0, -0.19, 0]} castShadow />
        {/* Shoe: a rounded black slipper, toe forward */}
        <mesh geometry={geos.ball} material={mats.shoe} position={[0, -0.4, 0.035]} scale={[0.045, 0.035, 0.09]} castShadow />
      </group>
    </group>
  )
}

/** The doll's body. `rig` collects the joints so a pose can be put on it. */
function DollBody({ rig }: { rig: React.MutableRefObject<Rig> }) {
  const mats = getMats()
  const geos = getGeos()
  const ringlets = useMemo(() => {
    const out: Array<{ p: [number, number, number]; r: [number, number, number]; s: number }> = []
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (0.62 + (i / 12) * 0.76) // round the back, from one side to the other
      const sideways = Math.sin(a)
      out.push({
        p: [sideways * 0.098, -0.075 - (i % 2) * 0.02, Math.cos(a) * 0.09 - 0.01],
        r: [Math.cos(a) * -0.15, 0, sideways * 0.15],
        s: 0.85 + ((i * 7) % 5) * 0.08,
      })
    }
    return out
  }, [])
  const set = (k: keyof Omit<Rig, 'marks'>) => (g: THREE.Group | null) => {
    rig.current[k] = g
  }
  return (
    <group ref={set('hips')} position={[0, 0.92, 0]}>
      <object3D ref={(o) => { if (o) rig.current.marks[2] = o }} />
      {/* Skirt, sash and a lace petticoat peeping out at the hem */}
      <group ref={set('skirt')} position={[0, 0.1, 0]}>
        <mesh geometry={geos.skirt} material={mats.dress} castShadow />
        <mesh geometry={geos.hem} material={mats.lace} position={[0, -0.63, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
      <Leg side={1} rig={rig} mats={mats} geos={geos} />
      <Leg side={-1} rig={rig} mats={mats} geos={geos} />

      <group ref={set('spine')} position={[0, 0.1, 0]}>
        <mesh geometry={geos.bodice} material={mats.dress} castShadow />
        <object3D ref={(o) => { if (o) rig.current.marks[1] = o }} position={[0, 0.28, 0]} />
        <mesh geometry={geos.sash} material={mats.ribbon} position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} />
        {/* The sash's bow at the back */}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={geos.ball} material={mats.ribbon} position={[s * 0.05, 0.04, -0.12]} rotation={[0, 0, s * 0.5]} scale={[0.06, 0.035, 0.02]} />
        ))}
        <mesh geometry={geos.collar} material={mats.lace} position={[0, 0.455, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Arm side={1} rig={rig} mats={mats} geos={geos} />
        <Arm side={-1} rig={rig} mats={mats} geos={geos} />

        <mesh geometry={geos.neck} material={mats.porcelain} position={[0, 0.5, 0]} castShadow />
        <group ref={set('head')} position={[0, 0.54, 0.005]}>
          <group position={[0, 0.1, 0]}>
            <object3D ref={(o) => { if (o) rig.current.marks[0] = o }} />
            <mesh geometry={geos.head} material={mats.face} castShadow />
            {/* Glass eyes, set into the painted sockets */}
            {[-1, 1].map((s) => (
              <group key={s} position={[s * EYE_X, EYE_Y, 0.087]}>
                <mesh geometry={geos.ball} material={mats.eyeWhite} scale={[0.019, 0.015, 0.012]} />
                <mesh geometry={geos.ball} material={mats.iris} position={[0, -0.001, 0.0105]} scale={[0.0108, 0.0108, 0.004]} />
                <mesh geometry={geos.ball} material={mats.pupil} position={[0, -0.001, 0.0138]} scale={[0.005, 0.005, 0.0015]} />
              </group>
            ))}
            {/* Hair: the back and sides, a blunt fringe on top, ringlets to the shoulders */}
            <mesh geometry={geos.hairBack} material={mats.hair} scale={[HEAD_R[0] * 1.08, HEAD_R[1] * 1.06, HEAD_R[2] * 1.08]} castShadow />
            <mesh geometry={geos.hairTop} material={mats.hair} scale={[HEAD_R[0] * 1.07, HEAD_R[1] * 1.05, HEAD_R[2] * 1.09]} castShadow />
            {ringlets.map((r, i) => (
              <mesh key={i} geometry={geos.ringlet} material={mats.hair} position={r.p} rotation={r.r} scale={[1, r.s, 1]} castShadow />
            ))}
            {/* A ribbon bow on one side */}
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={geos.ball} material={mats.ribbon} position={[0.06 + s * 0.035, 0.1, -0.02]} rotation={[0, 0, s * 0.6]} scale={[0.04, 0.025, 0.018]} />
            ))}
            <mesh geometry={geos.ball} material={mats.ribbon} position={[0.06, 0.1, -0.015]} scale={0.014} />
          </group>
        </group>
      </group>
    </group>
  )
}

const emptyRig = (): Rig => ({ hips: null, spine: null, head: null, skirt: null, shL: null, elL: null, shR: null, elR: null, hipL: null, knL: null, hipR: null, knR: null, marks: [] })

/** Set dressing: holds one pose forever. */
function StillDoll({ pose, scale }: { pose: string; scale: number }) {
  const rig = useRef<Rig>(emptyRig())
  const group = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    applyPose(rig.current, POSES[pose] ?? POSES.stand)
    // The little ones are too small to throw a shadow worth its cost.
    if (scale < 0.7) group.current?.traverse((o) => (o.castShadow = false))
  }, [pose, scale])
  return (
    <group ref={group} scale={scale}>
      <DollBody rig={rig} />
    </group>
  )
}

export function Doll({ mesh }: { mesh: DollMesh }) {
  if (mesh.role === 'hunter') return <HunterDoll mesh={mesh} />
  return <StillDoll pose={mesh.pose} scale={mesh.scale} />
}

// ---- Finding her way ---------------------------------------------------------------
// The floor as a fine grid. A cell is blocked if any solid comes within her
// radius of it at body height. Doors are their own cells: open, she walks
// through; shut, she has to stop and open them, so a route through a shut door
// costs extra.

const RES = 0.25
const RADIUS = 0.26
const DOOR_COST = 8

type Door = { flag: string; box: AABB }

class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly fixed: Uint8Array
  readonly door: Int16Array
  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
    fixed: AABB[],
    readonly doors: Door[],
  ) {
    this.cols = Math.ceil((x1 - x0) / RES)
    this.rows = Math.ceil((z1 - z0) / RES)
    this.fixed = new Uint8Array(this.cols * this.rows)
    this.door = new Int16Array(this.cols * this.rows).fill(-1)
    const mark = (b: AABB, fn: (i: number) => void) => {
      if (b.max.y < 0.15 || b.min.y > 1.6) return // floors, ceilings, lintels, things on shelves
      const c0 = Math.max(0, Math.floor((b.min.x - RADIUS - x0) / RES))
      const c1 = Math.min(this.cols - 1, Math.floor((b.max.x + RADIUS - x0) / RES))
      const r0 = Math.max(0, Math.floor((b.min.z - RADIUS - z0) / RES))
      const r1 = Math.min(this.rows - 1, Math.floor((b.max.z + RADIUS - z0) / RES))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const [cx, cz] = this.center(r * this.cols + c)
          if (cx >= b.min.x - RADIUS && cx <= b.max.x + RADIUS && cz >= b.min.z - RADIUS && cz <= b.max.z + RADIUS) fn(r * this.cols + c)
        }
      }
    }
    for (const b of fixed) mark(b, (i) => (this.fixed[i] = 1))
    doors.forEach((d, k) => mark(d.box, (i) => {
      if (!this.fixed[i]) this.door[i] = k
    }))
  }
  index(x: number, z: number) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / RES)))
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.z0) / RES)))
    return r * this.cols + c
  }
  center(i: number): [number, number] {
    return [this.x0 + ((i % this.cols) + 0.5) * RES, this.z0 + (Math.floor(i / this.cols) + 0.5) * RES]
  }
  shut(i: number, flags: Record<string, boolean>) {
    const d = this.door[i]
    return d >= 0 && !flags[this.doors[d].flag]
  }
  /** Can she walk straight from a to b without touching anything or a shut door? */
  clear(ax: number, az: number, bx: number, bz: number, flags: Record<string, boolean>) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (RES * 0.5))
    for (let k = 1; k <= n; k++) {
      const i = this.index(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)
      if (this.fixed[i] || this.shut(i, flags)) return false
    }
    return true
  }
  /** The nearest cell to i that she can stand in. */
  nearestOpen(i: number) {
    if (!this.fixed[i]) return i
    const [x, z] = this.center(i)
    let best = i
    let bd = Infinity
    for (let k = 0; k < this.fixed.length; k++) {
      if (this.fixed[k]) continue
      const [cx, cz] = this.center(k)
      const d = (cx - x) ** 2 + (cz - z) ** 2
      if (d < bd) {
        bd = d
        best = k
      }
    }
    return best
  }
  /** A* over the grid, eight ways; diagonals only where both sides are clear. */
  path(from: number, to: number, flags: Record<string, boolean>): number[] {
    // Either end may be in a blocked cell (she lunged at you past a table's edge,
    // or you're pressed against one): start and end at the nearest open ones.
    from = this.nearestOpen(from)
    to = this.nearestOpen(to)
    const N = this.fixed.length
    const g = new Float32Array(N).fill(Infinity)
    const prev = new Int32Array(N).fill(-1)
    const closed = new Uint8Array(N)
    const [tx, tz] = this.center(to)
    const h = (i: number) => {
      const [x, z] = this.center(i)
      return Math.hypot(x - tx, z - tz) / RES
    }
    // A small binary heap of [f, cell].
    const heap: Array<[number, number]> = []
    const push = (f: number, i: number) => {
      heap.push([f, i])
      let k = heap.length - 1
      while (k > 0) {
        const p = (k - 1) >> 1
        if (heap[p][0] <= heap[k][0]) break
        ;[heap[p], heap[k]] = [heap[k], heap[p]]
        k = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let k = 0
        for (;;) {
          const l = k * 2 + 1
          const r = l + 1
          let m = k
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r
          if (m === k) break
          ;[heap[m], heap[k]] = [heap[k], heap[m]]
          k = m
        }
      }
      return top
    }
    g[from] = 0
    push(h(from), from)
    const C = this.cols
    while (heap.length) {
      const [, cur] = pop()
      if (closed[cur]) continue
      if (cur === to) break
      closed[cur] = 1
      const r = Math.floor(cur / C)
      const c = cur % C
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nc < 0 || nr >= this.rows || nc >= C) continue
          const ni = nr * C + nc
          if (this.fixed[ni] || closed[ni]) continue
          if (dr && dc && (this.fixed[r * C + nc] || this.fixed[nr * C + c])) continue
          const step = (dr && dc ? Math.SQRT2 : 1) + (this.shut(ni, flags) ? DOOR_COST : 0)
          const ng = g[cur] + step
          if (ng < g[ni]) {
            g[ni] = ng
            prev[ni] = cur
            push(ng + h(ni), ni)
          }
        }
      }
    }
    if (prev[to] < 0 && to !== from) return []
    const out: number[] = []
    for (let k = to; k !== -1; k = prev[k]) out.push(k)
    return out.reverse()
  }
}

// ---- The hunter ----------------------------------------------------------------

/** Unseen, she moves at this pace: a little slower than you walk. */
const CREEP_SPEED = 2.3
/** While your eyes are shut she lunges. */
const BLINK_SPEED = 7
/** Close enough to take hold of you. */
const CATCH_RANGE = 0.8
/** How long, unseen, she needs to open a shut door. */
const DOOR_TIME = 1.3
/** A lamp in your hand still shows her this far off in a blackout. */
const LAMP_RANGE = 5
const BLINK_EVERY: [number, number] = [7, 12]
const BLACKOUT_FIRST = 22
const BLACKOUT_EVERY: [number, number] = [26, 42]

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function HunterDoll({ mesh }: { mesh: DollMesh }) {
  const root = useRef<THREE.Group>(null)
  const rig = useRef<Rig>(emptyRig())
  const { camera } = useThree()
  const [sx, sz, syaw] = mesh.start ?? [0, 0, 0]
  const st = useRef({
    x: sx,
    z: sz,
    yaw: syaw,
    pose: 'slump',
    seen: true,
    moved: 0, // metres moved since she was last seen
    poseT: 0,
    path: [] as number[],
    repath: 0,
    doorT: 0,
    clickAcc: 0,
    revealed: false,
    lastSting: -99,
    t: 0,
    blinkIn: rand(...BLINK_EVERY),
    blinkT: -1,
    blackoutIn: BLACKOUT_FIRST,
    blackout: null as null | { phase: 'stutter' | 'out' | 'return'; t: number; len: number; next: number },
  })
  const audio = useRef<DollAudio | null>(null)
  const paused = useThree((s) => s.frameloop === 'demand')
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), fwd: new THREE.Vector3(), head: new THREE.Vector3() }), [])

  // What she can't see or walk through: every solid thing, and the doors while they're shut.
  const world = useMemo(() => {
    const level = useWorld.getState().level
    const solid = level?.objects.filter((o) => o.isSolid) ?? []
    const isDoor = (o: (typeof solid)[number]) => !!o.pose?.unblocksWhenOpen
    const fixed = solid.filter((o) => !isDoor(o)).map(computeAABB)
    const doors = solid.filter(isDoor).map((o) => ({ flag: o.pose!.stateId, box: computeAABB(o) }))
    const [x0, z0, x1, z1] = mesh.bounds ?? [-20, -20, 20, 20]
    return { fixed, doors, nav: new NavGrid(x0, z0, x1, z1, fixed, doors), key: '', boxes: [] as AABB[] }
  }, [mesh.bounds])

  useLayoutEffect(() => applyPose(rig.current, POSES.slump), [])
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __doll?: unknown }).__doll = { st: st.current, nav: world.nav, watch, rig: rig.current }
  }, [world])

  useEffect(() => {
    resetWatch()
    const a = new DollAudio()
    a.start()
    audio.current = a
    const resume = () => a.resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      a.dispose()
      audio.current = null
      resetWatch()
    }
  }, [])
  useEffect(() => audio.current?.setPaused(paused), [paused])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    const w = useWorld.getState()
    const g = root.current
    if (!g) return
    s.t += dt
    const over = w.caught || w.won
    if (over) {
      watch.blink = 0
      watch.dry = 0
      watch.power = 1
      audio.current?.update({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 }, { x: 1e6, y: 0, z: 0 }, { awake: false, moving: true, dist: 1e6 })
      return
    }
    const locked = !!document.pointerLockElement
    if (!watch.awake && mesh.wakeFlag && w.flags[mesh.wakeFlag]) watch.awake = true

    // ---- Your eyes and the lights -------------------------------------------
    if (watch.awake && locked) {
      // Eyes dry out over the last second and a half, then blink.
      if (s.blinkT < 0) {
        s.blinkIn -= dt
        watch.dry = Math.min(1, Math.max(0, 1 - s.blinkIn / 1.5))
        if (s.blinkIn <= 0) s.blinkT = 0
      }
      if (s.blinkT >= 0) {
        s.blinkT += dt
        const t = s.blinkT
        watch.blink = t < 0.07 ? t / 0.07 : t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.09)
        if (t > 0.3) {
          s.blinkT = -1
          s.blinkIn = rand(...BLINK_EVERY)
          watch.blink = 0
          watch.dry = 0
        }
      }
      // Now and then the power fails: a stutter, a second or so of black, a stutter back.
      const b = s.blackout
      if (!b) {
        s.blackoutIn -= dt
        if (s.blackoutIn <= 0) {
          s.blackout = { phase: 'stutter', t: 0, len: 0.9, next: 0 }
          audio.current?.buzz(0.9)
        }
      } else {
        b.t += dt
        b.next -= dt
        if (b.phase !== 'out' && b.next <= 0) {
          watch.power = Math.random() < 0.5 ? rand(0.05, 0.3) : rand(0.6, 1)
          b.next = rand(0.04, 0.12)
        }
        if (b.t >= b.len) {
          if (b.phase === 'stutter') {
            s.blackout = { phase: 'out', t: 0, len: rand(1.1, 1.7), next: 0 }
            watch.power = 0
            audio.current?.clunk()
          } else if (b.phase === 'out') {
            s.blackout = { phase: 'return', t: 0, len: 0.45, next: 0 }
            audio.current?.buzz(0.45)
          } else {
            s.blackout = null
            watch.power = 1
            s.blackoutIn = rand(...BLACKOUT_EVERY)
          }
        }
      }
    }

    // ---- Can she be seen? ------------------------------------------------------
    const dx = camera.position.x - s.x
    const dz = camera.position.z - s.z
    const dist = Math.hypot(dx, dz)
    const flags = w.flags
    const key = world.doors.map((d) => (flags[d.flag] ? '1' : '0')).join('')
    if (key !== world.key || !world.boxes.length) {
      world.key = key
      world.boxes = [...world.fixed, ...world.doors.filter((d) => !flags[d.flag]).map((d) => d.box)]
    }
    let seen = false
    if (locked && watch.blink < 0.5) {
      const lamp = w.selectedItem === 'lantern' && w.inventory.includes('lantern') && dist < LAMP_RANGE
      if (watch.power > 0.25 || lamp) {
        camera.getWorldDirection(tmp.fwd)
        for (const m of rig.current.marks) {
          if (!m) continue
          m.getWorldPosition(tmp.v)
          const ahead = (tmp.v.x - camera.position.x) * tmp.fwd.x + (tmp.v.y - camera.position.y) * tmp.fwd.y + (tmp.v.z - camera.position.z) * tmp.fwd.z
          if (ahead <= 0.05) continue
          const p = tmp.v.clone().project(camera)
          if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue
          if (segmentHitsBox(camera.position, tmp.v, world.boxes)) continue
          seen = true
          break
        }
      }
    }

    // ---- Move while nobody's looking ------------------------------------------------
    let moving = false
    if (watch.awake && !seen) {
      const nav = world.nav
      const speed = watch.blink > 0.3 ? BLINK_SPEED : CREEP_SPEED
      s.repath -= dt
      if (s.repath <= 0 || !s.path.length) {
        s.repath = 0.3
        s.path = nav.path(nav.index(s.x, s.z), nav.index(camera.position.x, camera.position.z), flags)
      }
      // Drop the cells she's already reached.
      while (s.path.length > 1) {
        const [cx, cz] = nav.center(s.path[0])
        if (Math.hypot(cx - s.x, cz - s.z) < RES * 0.75 || nav.index(s.x, s.z) === s.path[0]) s.path.shift()
        else break
      }
      let tx = camera.position.x
      let tz = camera.position.z
      let blockedBy = -1
      if (s.path.length) {
        // Head for the furthest cell ahead she can walk to in a straight line.
        let pick = 0
        for (let k = Math.min(s.path.length - 1, 14); k >= 0; k--) {
          const [cx, cz] = nav.center(s.path[k])
          if (nav.clear(s.x, s.z, cx, cz, flags)) {
            pick = k
            break
          }
        }
        ;[tx, tz] = nav.center(s.path[pick])
        const nextDoor = s.path.slice(0, pick + 2).find((i) => nav.shut(i, flags))
        if (nextDoor !== undefined) {
          const [cx, cz] = nav.center(nextDoor)
          if (Math.hypot(cx - s.x, cz - s.z) < 0.55) blockedBy = nav.door[nextDoor]
        }
        if (pick === s.path.length - 1 && dist < 1.5) {
          tx = camera.position.x
          tz = camera.position.z
        }
      }
      if (blockedBy >= 0) {
        // At a shut door: she opens it, slowly, and you hear it go.
        s.doorT += dt
        if (s.doorT > DOOR_TIME) {
          w.setFlag(world.doors[blockedBy].flag, true)
          sfx.play('door')
          s.doorT = 0
          s.repath = 0
        }
      } else {
        s.doorT = 0
        const mx = tx - s.x
        const mz = tz - s.z
        const md = Math.hypot(mx, mz)
        if (md > 0.01 && s.path.length) {
          const step = Math.min(md, speed * dt)
          s.x += (mx / md) * step
          s.z += (mz / md) * step
          s.moved += step
          s.clickAcc += step
          moving = true
        }
      }
      s.yaw = Math.atan2(camera.position.x - s.x, camera.position.z - s.z)
      // A new pose every little while she's on the move, never the same one twice.
      s.poseT -= dt
      if (moving && s.poseT <= 0) {
        s.poseT = 0.45
        const pool = dist > 6 ? ['stand', 'creep', 'stalk', 'broken'] : dist > 2.6 ? ['creep', 'reach', 'broken', 'stalk'] : ['reach', 'reachHigh', 'grab']
        const choices = pool.filter((p) => p !== s.pose)
        s.pose = choices[Math.floor(Math.random() * choices.length)]
        applyPose(rig.current, jitter(POSES[s.pose], 0.18))
      }
      if (s.clickAcc > 0.4) {
        s.clickAcc = 0
        audio.current?.click(1.4 - Math.min(1.2, dist / 12))
      }
      if (Math.hypot(camera.position.x - s.x, camera.position.z - s.z) < CATCH_RANGE) {
        w.setCaught(true)
      }
    }
    // Looking back and finding her moved: a sting the first time, and whenever she's got close.
    if (seen && !s.seen && s.moved > 0.8) {
      if (!s.revealed || (dist < 4.5 && s.t - s.lastSting > 5)) {
        audio.current?.sting(s.revealed ? 0.8 : 1)
        s.revealed = true
        s.lastSting = s.t
      }
      s.moved = 0
    }
    s.seen = seen

    g.position.set(s.x, 0, s.z)
    g.rotation.y = s.yaw

    if (audio.current) {
      camera.getWorldDirection(tmp.fwd)
      rig.current.marks[0]?.getWorldPosition(tmp.head)
      audio.current.update(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: tmp.fwd.x, fy: tmp.fwd.y, fz: tmp.fwd.z },
        tmp.head,
        { awake: watch.awake, moving, dist },
      )
    }
  })

  return (
    <group ref={root} position={[sx, 0, sz]} rotation={[0, syaw, 0]}>
      <DollBody rig={rig} />
    </group>
  )
}
