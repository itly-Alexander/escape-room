import { useMemo } from 'react'
import * as THREE from 'three'

type Props = {
  tableSize: [number, number] // tabletop [width (x), depth (z)]
  side: number // side length of the (square) cloth
  spin: number // rotation of the cloth relative to the table, radians
  color: string
}

const REST = 0.006 // cloth thickness above the tabletop
const SEGS = 48

/**
 * A square cloth thrown over a tabletop and turned by `spin`: where it lies on
 * the table it's flat; wherever it passes the table's edge it falls straight
 * down, so a 45° cloth hangs in four pointed flaps and the table's corners
 * stay uncovered. Object origin = centre of the tabletop's top face.
 */
export function TableCloth({ tableSize, side, spin, color }: Props) {
  const geometry = useMemo(() => buildCloth(tableSize, side, spin), [tableSize[0], tableSize[1], side, spin]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  )
}

function buildCloth([tw, td]: [number, number], side: number, spin: number) {
  const hx = tw / 2
  const hz = td / 2
  const cos = Math.cos(spin)
  const sin = Math.sin(spin)
  const positions: number[] = []
  const indices: number[] = []

  for (let j = 0; j <= SEGS; j++) {
    for (let i = 0; i <= SEGS; i++) {
      const u = (i / SEGS - 0.5) * side
      const v = (j / SEGS - 0.5) * side
      const px = u * cos - v * sin
      const pz = u * sin + v * cos

      const dx = Math.max(Math.abs(px) - hx, 0)
      const dz = Math.max(Math.abs(pz) - hz, 0)
      if (dx === 0 && dz === 0) {
        positions.push(px, REST, pz)
        continue
      }
      // Past the edge: fall vertically, further the further the cloth reaches.
      const d = Math.hypot(dx, dz)
      // Soft folds that grow with the drop, running along the edge.
      const along = dx > dz ? pz : px
      const fold = Math.min(d, 0.5) * 0.06 * Math.sin(along * 22 + d * 6)
      const gx = dx > 0 ? Math.sign(px) * (hx + REST + Math.abs(fold) + d * 0.04) : px
      const gz = dz > 0 ? Math.sign(pz) * (hz + REST + Math.abs(fold) + d * 0.04) : pz
      positions.push(gx, REST - d, gz)
    }
  }
  for (let j = 0; j < SEGS; j++) {
    for (let i = 0; i < SEGS; i++) {
      const a = j * (SEGS + 1) + i
      const b = a + 1
      const c = a + SEGS + 1
      const e = c + 1
      indices.push(a, c, b, b, c, e)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
