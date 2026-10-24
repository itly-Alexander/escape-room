import * as THREE from 'three'

export type ProceduralTextureName = 'brick'

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
  }
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
  ctx.fillStyle = '#2a2420'
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
      // Base ~#9a7a5c — warm sandstone that reads under candlelight; per-brick
      // jitter keeps the pattern from looking stamped.
      const rr = 0x9a + ((seed * 13) % 25) - 12
      const gg = 0x7a + ((seed * 7) % 19) - 9
      const bb = 0x5c + ((seed * 5) % 15) - 7
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

  const tex = new THREE.CanvasTexture(canvas)
  return tex
}
