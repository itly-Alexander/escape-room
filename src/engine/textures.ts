import * as THREE from 'three'

export type ProceduralTextureName =
  | 'brick'
  | 'letter'
  | 'letter-moon'
  | 'letter-eye'
  | 'letter-key'
  | 'plaque'
  | 'plaque-back'
  | 'seal-sun'
  | 'seal-moon'
  | 'seal-eye'
  | 'seal-key'
  | 'indent-sun'
  | 'indent-moon'
  | 'indent-eye'
  | 'indent-key'
  | 'moss'
  | 'moss-b'
  | 'moss-c'

type Symbol4 = 'sun' | 'moon' | 'eye' | 'key'

const cache = new Map<ProceduralTextureName, THREE.CanvasTexture>()

/**
 * Returns a module-cached CanvasTexture for a named procedural pattern.
 * All call sites share the same GPU texture — the renderer only uploads
 * it once, and setting `.repeat` on it is a global change (fine when
 * every surface wants the same tiling, which is our case).
 */
export function getProceduralTexture(name: ProceduralTextureName): THREE.CanvasTexture {
  const hit = cache.get(name)
  if (hit) return hit
  const tex = build(name)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(name, tex)
  return tex
}

function build(name: ProceduralTextureName): THREE.CanvasTexture {
  switch (name) {
    case 'brick':
      return buildBrick()
    case 'letter':
      return buildLetter('sun')
    case 'letter-moon':
      return buildLetter('moon')
    case 'letter-eye':
      return buildLetter('eye')
    case 'letter-key':
      return buildLetter('key')
    case 'moss':
      return buildMoss(11)
    case 'moss-b':
      return buildMoss(23)
    case 'moss-c':
      return buildMoss(37)
    case 'plaque':
      return buildPlaque()
    case 'plaque-back':
      return buildPlaqueBack()
    case 'seal-sun':
    case 'seal-moon':
    case 'seal-eye':
    case 'seal-key':
      return buildSeal(name.slice(5) as Symbol4, false)
    case 'indent-sun':
    case 'indent-moon':
    case 'indent-eye':
    case 'indent-key':
      return buildSeal(name.slice(7) as Symbol4, true)
  }
}

/** The four keepers' marks, drawn with the context's current stroke/fill colour. */
function drawSymbol(ctx: CanvasRenderingContext2D, kind: Symbol4, cx: number, cy: number, r: number) {
  ctx.lineWidth = Math.max(1.6, r * 0.09)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'sun') {
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2)
    ctx.stroke()
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(t) * r * 0.65, cy + Math.sin(t) * r * 0.65)
      ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'moon') {
    // A crescent: the outer circle's big arc, then back along an offset inner circle.
    const R = r * 0.85
    const d = R * 0.5
    const ri = R * 0.82
    const x = (d * d + R * R - ri * ri) / (2 * d)
    const y = Math.sqrt(Math.max(0, R * R - x * x))
    const th = Math.atan2(y, x)
    const phi2 = Math.atan2(y, x - d)
    const phi1 = Math.atan2(-y, x - d)
    ctx.beginPath()
    ctx.arc(cx - d * 0.4, cy, R, -th, th, true)
    ctx.arc(cx - d * 0.4 + d, cy, ri, phi2, phi1 + Math.PI * 2, false)
    ctx.closePath()
    ctx.stroke()
    ctx.globalAlpha *= 0.35
    ctx.fill()
    ctx.globalAlpha /= 0.35
  } else if (kind === 'eye') {
    ctx.beginPath()
    ctx.moveTo(cx - r, cy)
    ctx.quadraticCurveTo(cx, cy - r * 0.95, cx + r, cy)
    ctx.quadraticCurveTo(cx, cy + r * 0.95, cx - r, cy)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // A key lying on its side: ring, shaft and two teeth.
    ctx.beginPath()
    ctx.arc(cx - r * 0.6, cy, r * 0.32, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx - r * 0.6, cy, r * 0.12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.28, cy)
    ctx.lineTo(cx + r, cy)
    ctx.moveTo(cx + r * 0.62, cy)
    ctx.lineTo(cx + r * 0.62, cy + r * 0.34)
    ctx.moveTo(cx + r * 0.92, cy)
    ctx.lineTo(cx + r * 0.92, cy + r * 0.26)
    ctx.stroke()
  }
}

/**
 * Moss over one whole 2 m × 3 m wall face, on a transparent background, used
 * cut out. Instead of one patch it's sporadic growth: a noise field decides where
 * moss takes hold, favouring the foot of the wall, the mortar lines between
 * courses of brick and the occasional damp streak running down from above, so
 * you get scattered clumps, thin creeping lines and bare stone between. The
 * edges are fine-grained and fuzzy.
 */
function buildMoss(seed: number): THREE.CanvasTexture {
  const W = 384
  const H = 576 // 2 m × 3 m
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)

  const hash = (x: number, y: number, s: number) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const vnoise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = smooth(x - xi)
    const yf = smooth(y - yi)
    const a = hash(xi, yi, s)
    const b = hash(xi + 1, yi, s)
    const c = hash(xi, yi + 1, s)
    const d = hash(xi + 1, yi + 1, s)
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
  const fbm = (x: number, y: number, s: number) =>
    vnoise(x, y, s) * 0.5 + vnoise(x * 2, y * 2, s + 1) * 0.28 + vnoise(x * 4, y * 4, s + 2) * 0.14 + vnoise(x * 8, y * 8, s + 3) * 0.08

  // A handful of damp streaks coming down from the top, each a vertical band.
  const rnd = (() => {
    let a = seed * 7919
    return () => {
      a = (a * 1664525 + 1013904223) >>> 0
      return a / 4294967296
    }
  })()
  const streaks = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({ x: rnd() * W, len: 0.25 + rnd() * 0.5, w: 8 + rnd() * 14 }))

  for (let y = 0; y < H; y++) {
    const up = 1 - y / H // 0 at the bottom of the wall, 1 at the top
    for (let x = 0; x < W; x++) {
      // Where moss takes hold: strongest low down, weaker higher up.
      let bias = 0.5 * Math.pow(1 - up, 2.2)
      // Along the mortar between courses (every 0.25 m = 36 px of this image's 576).
      const course = (y % 48) / 48
      const mortar = Math.exp(-Math.pow((course - 0.02) * 22, 2)) + Math.exp(-Math.pow((course - 0.98) * 22, 2))
      bias += 0.16 * mortar
      // Damp streaks.
      for (const st of streaks) {
        const dx = (x - (st.x + Math.sin(y * 0.03 + st.x) * 6)) / st.w
        if (Math.abs(dx) < 2 && up > 1 - st.len) bias += 0.28 * Math.exp(-dx * dx) * ((up - (1 - st.len)) / st.len)
      }
      // Large-scale clumping, then fine grain.
      const clump = fbm(x / 70, y / 70, seed)
      const grain = fbm(x / 9, y / 9, seed + 40)
      const field = clump * 0.82 + grain * 0.18 + bias - 0.7
      const i = (y * W + x) * 4
      if (field < 0.04) {
        img.data[i + 3] = 0
        continue
      }
      // Colour: dark and wet at the edge of a clump, lighter on top of it.
      const t = Math.min(1, (field - 0.04) / 0.28)
      const shade = 0.45 + 0.55 * t + (grain - 0.5) * 0.35
      img.data[i] = (22 + 40 * shade) | 0
      img.data[i + 1] = (34 + 62 * shade) | 0
      img.data[i + 2] = (14 + 24 * shade) | 0
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * The front of the stele in the study: dark wood with a gilt border and four
 * faint rings where the seals go. (The hollows themselves are separate discs
 * set into the board, each carved with its own mark.)
 */
function buildPlaque(): THREE.CanvasTexture {
  const W = 512
  const H = 200
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#2b1f14')
  g.addColorStop(1, '#1b130b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(255,220,160,${0.01 + Math.random() * 0.03})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 8, 1)
  }
  const gold = '#cfa64c'
  ctx.strokeStyle = gold
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.lineWidth = 1.5
  ctx.strokeRect(20, 20, W - 40, H - 40)
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.arc(64 + i * 128, 100, 52, 0, Math.PI * 2)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(canvas)
}

/** The back of the stele: plain planks with an iron strap, where the key hangs. */
function buildPlaqueBack(): THREE.CanvasTexture {
  const W = 512
  const H = 200
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#24190f'
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 40) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, y, W, 2)
  }
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(255,220,160,${0.01 + Math.random() * 0.035})`
    ctx.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 18, 1)
  }
  ctx.fillStyle = '#2f2a26'
  ctx.fillRect(0, 78, W, 44)
  ctx.fillStyle = '#5a534b'
  for (const x of [30, 120, 220, 290, 392, 480]) {
    ctx.beginPath()
    ctx.arc(x, 100, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(canvas)
}

/**
 * A round wooden seal carved with one of the four marks, or (indent = true)
 * the dark hollow in the stele that it fits. Drawn as a disc filling the
 * square, for a cylinder's end cap.
 */
function buildSeal(kind: Symbol4, indent: boolean): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const c = S / 2
  ctx.fillStyle = indent ? '#0b0705' : '#6b4524'
  ctx.fillRect(0, 0, S, S)
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, c - 2, 0, Math.PI * 2)
  ctx.clip()
  if (indent) {
    const g = ctx.createRadialGradient(c, c, 10, c, c, c)
    g.addColorStop(0, '#15100a')
    g.addColorStop(1, '#050302')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  } else {
    const g = ctx.createRadialGradient(c * 0.9, c * 0.85, 10, c, c, c)
    g.addColorStop(0, '#b27a42')
    g.addColorStop(1, '#7a4c24')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    // Growth rings and fine grain.
    ctx.strokeStyle = 'rgba(60, 32, 12, 0.22)'
    for (let r = 8; r < c; r += 4 + Math.random() * 5) {
      ctx.lineWidth = 0.8 + Math.random() * 1.4
      ctx.beginPath()
      ctx.arc(c + (Math.random() - 0.5) * 6, c + (Math.random() - 0.5) * 6, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(50, 28, 10, ${0.03 + Math.random() * 0.07})`
      ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 6, 1)
    }
  }
  ctx.restore()
  // Rim.
  ctx.lineWidth = indent ? 5 : 7
  ctx.strokeStyle = indent ? '#7a5a22' : '#3d2410'
  ctx.beginPath()
  ctx.arc(c, c, c - 6, 0, Math.PI * 2)
  ctx.stroke()
  // The mark: pressed into the wood, or just outlined in the hollow. (A
  // cylinder's end cap shows the image turned a quarter, so turn it back.)
  ctx.save()
  ctx.translate(c, c)
  ctx.rotate(-Math.PI / 2)
  ctx.translate(-c, -c)
  if (indent) {
    ctx.strokeStyle = '#8a6a2a'
    ctx.fillStyle = '#8a6a2a'
    ctx.globalAlpha = 0.9
    drawSymbol(ctx, kind, c, c, 70)
    ctx.globalAlpha = 1
  } else {
    ctx.strokeStyle = 'rgba(214, 160, 100, 0.55)'
    ctx.fillStyle = 'rgba(214, 160, 100, 0.55)'
    drawSymbol(ctx, kind, c + 2, c + 2, 70)
    ctx.strokeStyle = '#2d190a'
    ctx.fillStyle = '#2d190a'
    drawSymbol(ctx, kind, c, c, 70)
  }
  ctx.restore()
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

// A sheet of old paper with a hand-written letter on it: wobbly lines of ink
// scribble (unreadable up close, like handwriting seen from a distance), an
// underlined greeting, a signature flourish and a little doodle. Mapped once
// across the whole sheet rather than tiled.
function buildLetter(symbol: Symbol4): THREE.CanvasTexture {
  const W = 512
  const H = 360
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  let seed = 4242
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  ctx.fillStyle = '#e7dcc0'
  ctx.fillRect(0, 0, W, H)
  // Age: blotches, fibres, darker edges and fold creases.
  for (let i = 0; i < 24; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 20 + rand() * 60
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(140, 105, 55, ${0.05 + rand() * 0.1})`)
    g.addColorStop(1, 'rgba(140, 105, 55, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(90, 70, 40, ${0.02 + rand() * 0.04})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1)
  }
  ctx.strokeStyle = 'rgba(90, 70, 40, 0.18)'
  ctx.lineWidth = 2
  for (const x of [W / 3, (2 * W) / 3]) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + 3, H)
    ctx.stroke()
  }
  const edge = ctx.createLinearGradient(0, 0, 0, H)
  edge.addColorStop(0, 'rgba(70,50,25,0.28)')
  edge.addColorStop(0.08, 'rgba(70,50,25,0)')
  edge.addColorStop(0.92, 'rgba(70,50,25,0)')
  edge.addColorStop(1, 'rgba(70,50,25,0.3)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, W, H)

  // Ink: each line is a run of little loops and strokes, like cursive.
  ctx.strokeStyle = 'rgba(28, 26, 44, 0.9)'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const scribble = (x0: number, x1: number, y: number, size: number) => {
    ctx.lineWidth = 1.6
    ctx.beginPath()
    let x = x0
    ctx.moveTo(x, y)
    while (x < x1) {
      const step = size * (0.5 + rand() * 0.9)
      if (rand() < 0.12) {
        x += size * 1.2 // a space between words
        ctx.moveTo(x, y)
        continue
      }
      const up = rand() < 0.35 ? -size * (1.1 + rand() * 0.8) : -size * (0.3 + rand() * 0.5)
      ctx.bezierCurveTo(x + step * 0.2, y + up, x + step * 0.7, y + up * 0.6, x + step, y + (rand() - 0.5) * size * 0.4)
      x += step
    }
    ctx.stroke()
  }
  // Greeting, underlined.
  scribble(44, 170, 52, 11)
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(44, 60)
  ctx.quadraticCurveTo(110, 66, 176, 59)
  ctx.stroke()
  // Body.
  const lines = 9
  for (let i = 0; i < lines; i++) {
    const y = 96 + i * 26
    const end = i === lines - 1 ? 260 : 458 - rand() * 36
    scribble(44, end, y, 10 + rand() * 2)
  }
  // Signature flourish.
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(330, 330)
  ctx.bezierCurveTo(350, 300, 380, 345, 400, 318)
  ctx.bezierCurveTo(420, 292, 440, 340, 468, 312)
  ctx.stroke()
  // The keeper's mark, doodled in the corner: sun, moon, eye or key.
  ctx.fillStyle = 'rgba(28,26,44,0.9)'
  drawSymbol(ctx, symbol, 432, 56, 28)

  return new THREE.CanvasTexture(canvas)
}

// Running-bond brickwork: alternating rows offset by half a brick. The
// canvas is sized so the pattern tiles seamlessly — bricks that run off
// the right edge wrap back to the left.
function buildBrick(): THREE.CanvasTexture {
  const W = 256
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Mortar: slightly darker than the surrounding stone so grout lines read.
  ctx.fillStyle = '#16191c'
  ctx.fillRect(0, 0, W, H)

  const brickW = 64
  const brickH = 32
  const mortar = 3
  const rowCount = H / brickH

  for (let r = 0; r < rowCount; r++) {
    const yStart = r * brickH + mortar / 2
    const brickHeight = brickH - mortar
    const xOffset = r % 2 === 0 ? 0 : brickW / 2
    // Start one brick to the left so the row seams tile at the right edge.
    for (let c = -1; c < W / brickW + 1; c++) {
      const xStart = c * brickW + xOffset + mortar / 2
      const brickWidth = brickW - mortar
      // Deterministic per-brick tone variation so neighbouring bricks differ.
      const seed = (r * 31 + c * 17 + 7) & 0xff
      // Old weathered stone: desaturated cool grey with a faint green-brown
      // cast, per-brick jitter in brightness so it doesn't look stamped.
      const tone = ((seed * 13) % 37) - 18
      const rr = 0x74 + tone
      const gg = 0x7c + tone + ((seed * 7) % 7) - 3
      const bb = 0x88 + tone
      ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`
      ctx.fillRect(xStart, yStart, brickWidth, brickHeight)

      // Subtle top-edge highlight + bottom-edge shadow so each brick reads as
      // a block rather than a flat rectangle under harsh torchlight.
      ctx.fillStyle = 'rgba(255,230,200,0.08)'
      ctx.fillRect(xStart, yStart, brickWidth, 1)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(xStart, yStart + brickHeight - 1, brickWidth, 1)

      // Scatter a few darker specks for wear/pitting.
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      for (let n = 0; n < 4; n++) {
        const nx = xStart + ((seed * (n + 1) * 29) % brickWidth)
        const ny = yStart + ((seed * (n + 1) * 37) % brickHeight)
        ctx.fillRect(nx, ny, 1 + ((seed + n) % 2), 1)
      }
    }
  }

  // Age: mold blotches, damp streaks and grime. Deterministic PRNG so the
  // texture is stable, and every stamp is repeated at ±W/±H so it still tiles.
  let s = 1337
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
  const stamp = (x: number, y: number, draw: (x: number, y: number) => void) => {
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) draw(x + dx, y + dy)
  }

  // Mold: soft dark green-grey blooms, denser toward the bottom of the tile.
  for (let n = 0; n < 34; n++) {
    const x = rand() * W
    const y = rand() * H
    const r = 8 + rand() * 26
    const green = rand() < 0.6
    stamp(x, y, (px, py) => {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r)
      grad.addColorStop(0, green ? 'rgba(36, 58, 56, 0.38)' : 'rgba(20, 22, 18, 0.32)')
      grad.addColorStop(1, 'rgba(24, 34, 36, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(px - r, py - r, r * 2, r * 2)
    })
  }

  // Damp streaks running down from the mortar lines.
  for (let n = 0; n < 22; n++) {
    const x = rand() * W
    const y = rand() * H
    const len = 20 + rand() * 70
    const w = 2 + rand() * 4
    stamp(x, y, (px, py) => {
      const grad = ctx.createLinearGradient(px, py, px, py + len)
      grad.addColorStop(0, 'rgba(10, 12, 10, 0.3)')
      grad.addColorStop(1, 'rgba(10, 12, 10, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(px, py, w, len)
    })
  }

  // Overall grime so nothing reads as clean.
  ctx.fillStyle = 'rgba(24, 30, 38, 0.2)'
  ctx.fillRect(0, 0, W, H)

  const tex = new THREE.CanvasTexture(canvas)
  return tex
}
