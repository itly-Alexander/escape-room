import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

type Props = {
  size?: number
  seed?: number
}

// Flame layout: an emissive egg-shaped core, with a cluster of small
// additive-blended "tongues" wrapping its upper hemisphere. Each tongue
// flutters on its own phase, so the silhouette dances all around the
// top of the egg rather than being capped by a single triangular tip.
const CORE_SCALE: [number, number, number] = [0.75, 1.05, 0.75]

type TongueSpec = {
  pos: [number, number, number]
  baseScale: number // relative to flame size
  phase: number
}

function layoutTongues(size: number): TongueSpec[] {
  const egg = { rx: size, ry: size * 1.3, rz: size }
  // (azimuth, elevationFraction 0..1, scale) — elevation 0=equator, 1=top.
  const spec: Array<[number, number, number]> = [
    [0, 0.45, 0.95],
    [Math.PI / 3, 0.6, 0.85],
    [(2 * Math.PI) / 3, 0.5, 1.0],
    [Math.PI, 0.55, 0.9],
    [(4 * Math.PI) / 3, 0.65, 1.05],
    [(5 * Math.PI) / 3, 0.45, 0.9],
    [Math.PI / 7, 0.95, 1.15], // tallest central-ish tongue
    [Math.PI + 0.4, 0.9, 1.0],
  ]
  return spec.map(([az, elevF, s], i) => {
    const el = (elevF * Math.PI) / 2 // 0..π/2
    const cosE = Math.cos(el)
    return {
      pos: [egg.rx * cosE * Math.cos(az), egg.ry * Math.sin(el), egg.rz * cosE * Math.sin(az)],
      baseScale: s,
      phase: i * 1.37,
    }
  })
}

export function Flame({ size = 0.22, seed = 0 }: Props) {
  const coreRef = useRef<THREE.Mesh>(null)
  const coreMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const tongueRefs = useRef<Array<THREE.Mesh | null>>([])
  const tongueMatRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])

  const tongues = useMemo(() => layoutTongues(size), [size])
  const state = useRef({ v: 1, target: 1, t: Math.random() * 10 })

  useFrame((_, dt) => {
    const s = state.current
    s.t += dt
    if (Math.random() < dt * 10) s.target = 0.9 + Math.random() * 0.2
    s.v += (s.target - s.v) * Math.min(1, dt * 9)
    const t = s.t + seed

    const core = coreRef.current
    if (core) {
      const b = 0.98 + Math.sin(t * 5) * 0.02
      core.scale.set(CORE_SCALE[0] * b, CORE_SCALE[1] * b * (1 + Math.sin(t * 3.3) * 0.03), CORE_SCALE[2] * b)
    }
    if (coreMatRef.current) coreMatRef.current.emissiveIntensity = 2.6 + (s.v - 1) * 0.8

    for (let i = 0; i < tongues.length; i++) {
      const m = tongueRefs.current[i]
      if (!m) continue
      const spec = tongues[i]
      const p = spec.phase
      const sx = spec.baseScale * (0.85 + Math.sin(t * 7 + p) * 0.12)
      const sy = spec.baseScale * (1.0 + Math.sin(t * 5 + p * 1.3) * 0.35 + (s.v - 1) * 0.5)
      m.scale.set(sx, Math.max(0.4, sy), sx)
      m.position.x = spec.pos[0] + Math.sin(t * 6 + p) * size * 0.06
      m.position.z = spec.pos[2] + Math.cos(t * 5.5 + p * 0.9) * size * 0.06
      const mat = tongueMatRefs.current[i]
      if (mat) mat.opacity = 0.45 * (0.65 + Math.sin(t * 4 + p + 1.2) * 0.35 + (s.v - 1) * 0.4)
    }
  })

  return (
    <group>
      {/* Small emissive heart — the glowing coal at the base of the flame.
          Scaled well below `size` so the tongues (laid out at radius `size`)
          read as the dominant shape, not a halo around a big orb. */}
      <mesh ref={coreRef} scale={CORE_SCALE} raycast={() => null}>
        <sphereGeometry args={[size, 20, 14]} />
        <meshStandardMaterial
          ref={coreMatRef}
          color="#ff9440"
          emissive="#ff6a1a"
          emissiveIntensity={2.6}
          roughness={1}
          metalness={0}
          toneMapped={false}
        />
      </mesh>
      {/* Flame tongues wrapping the top of the egg. */}
      {tongues.map((spec, i) => (
        <mesh
          key={i}
          ref={(el) => {
            tongueRefs.current[i] = el
          }}
          position={[spec.pos[0], spec.pos[1], spec.pos[2]]}
          raycast={() => null}
        >
          <coneGeometry args={[size * 0.28, size * 1.1, 10]} />
          <meshBasicMaterial
            ref={(el) => {
              tongueMatRefs.current[i] = el
            }}
            color="#ffb860"
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
