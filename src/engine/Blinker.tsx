import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// A lamp that flashes a pattern over and over, and goes dark for a long beat
// before it starts again. It lights nothing: the glow is only its own.

/** [on, units] stretches of the pattern. */
function timeline(pattern: string): Array<[boolean, number]> {
  const out: Array<[boolean, number]> = []
  for (const ch of pattern) {
    if (ch === '.' || ch === '-') {
      out.push([true, ch === '.' ? 1 : 3], [false, 1])
    } else if (ch === ' ') {
      out.push([false, 2])
    } else if (ch === '/') {
      out.push([false, 6])
    }
  }
  out.push([false, 10]) // rest before it all begins again
  return out
}

export function Blinker({ pattern, unit, color }: { pattern: string; unit: number; color: string }) {
  const lens = useRef<THREE.MeshStandardMaterial>(null)
  const steps = useMemo(() => timeline(pattern), [pattern])
  const total = useMemo(() => steps.reduce((a, [, n]) => a + n, 0) * unit, [steps, unit])
  const t = useRef(0)

  useFrame((_, dt) => {
    t.current = (t.current + dt) % total
    let at = t.current / unit
    let on = false
    for (const [lit, n] of steps) {
      if (at < n) {
        on = lit
        break
      }
      at -= n
    }
    if (lens.current) lens.current.emissiveIntensity += ((on ? 3 : 0.03) - lens.current.emissiveIntensity) * 0.6
  })

  return (
    <group>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.34, 0.34, 0.1]} />
        <meshStandardMaterial color="#232323" roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 20]} />
        <meshStandardMaterial ref={lens} color={color} emissive={color} emissiveIntensity={0.03} roughness={0.3} />
      </mesh>
    </group>
  )
}
