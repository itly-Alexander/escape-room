import { useMemo } from 'react'
import * as THREE from 'three'

type Props = { seed: number; width: number; depth: number }

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A smooth, lumpy closed outline: a few low-frequency wobbles on a stretched ellipse. */
function outline(seed: number, w: number, d: number, grow = 0) {
  const r = rng(seed)
  const waves = [2, 3, 4, 5, 7].map((k) => ({ k, a: (0.5 / k) * (0.4 + r()), p: r() * Math.PI * 2 }))
  const pts: THREE.Vector2[] = []
  const N = 72
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    let rad = 1
    for (const { k, a, p } of waves) rad += a * Math.cos(k * t + p)
    pts.push(new THREE.Vector2(Math.cos(t) * (w / 2 + grow) * rad, Math.sin(t) * (d / 2 + grow) * rad))
  }
  return pts
}

/**
 * A puddle on the floor: a wet halo of darkened stone, with the still water
 * itself a little smaller and very dark and glossy so lamps glint in it. Every
 * seed gives a different outline. Origin is the middle, on the floor.
 */
export function Puddle({ seed, width, depth }: Props) {
  const { water, halo } = useMemo(() => {
    const make = (grow: number) => {
      const shape = new THREE.Shape(outline(seed, width, depth, grow))
      const g = new THREE.ShapeGeometry(shape, 1)
      g.rotateX(-Math.PI / 2)
      return g
    }
    return { water: make(0), halo: make(0.07) }
  }, [seed, width, depth])
  return (
    <group rotation={[0, (seed % 360) * (Math.PI / 180), 0]}>
      <mesh geometry={halo} position={[0, 0.002, 0]}>
        <meshStandardMaterial color="#0e0b09" roughness={0.3} metalness={0} />
      </mesh>
      <mesh geometry={water} position={[0, 0.004, 0]}>
        <meshStandardMaterial color="#0f2029" roughness={0.03} metalness={0} />
      </mesh>
    </group>
  )
}
