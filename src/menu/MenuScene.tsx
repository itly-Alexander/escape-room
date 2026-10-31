import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Flame } from '@/engine/Flame'

export function MenuScene() {
  return (
    <>
      <color attach="background" args={['#060509']} />
      {/* Close, faintly sickly fog so the chamber swallows itself. */}
      <fog attach="fog" args={['#0a0910', 3, 15]} />

      <ambientLight intensity={0.04} color="#2b2238" />

      {/* Cold moonlight glow from above/behind. */}
      <directionalLight
        position={[-6, 8, -4]}
        intensity={0.15}
        color="#6a7fb8"
      />

      <GhostLight />
      <Motes />

      {/* Stone floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#161218" roughness={1} metalness={0} />
      </mesh>

      {/* Back wall — big dim slab suggesting a chamber. */}
      <mesh position={[0, 3, -8]}>
        <planeGeometry args={[30, 10]} />
        <meshStandardMaterial color="#120f14" roughness={1} metalness={0} />
      </mesh>

      {/* Flanking braziers. */}
      <Brazier position={[-3.2, 0, -2]} seed={0.37} />
      <Brazier position={[3.2, 0, -2]} seed={1.91} />
    </>
  )
}

/** A pale, slowly breathing light deep in the room that stutters now and then. */
function GhostLight() {
  const ref = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    const breath = 0.5 + 0.5 * Math.sin(t * 0.5)
    const stutter = Math.sin(t * 23) * Math.sin(t * 7.3) > 0.92 ? 0.1 : 1
    ref.current.intensity = (0.4 + breath * 1.2) * stutter
    ref.current.position.x = Math.sin(t * 0.15) * 2.5
  })
  return (
    <pointLight
      ref={ref}
      position={[0, 2.5, -6]}
      distance={14}
      decay={2}
      color="#6f9c93"
    />
  )
}

/** Drifting pale specks of dust/ash hanging in the air. */
function Motes() {
  const ref = useRef<THREE.Points>(null)
  const count = 260
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16
      positions[i * 3 + 1] = Math.random() * 5
      positions[i * 3 + 2] = -9 + Math.random() * 14
      speeds[i] = 0.03 + Math.random() * 0.08
    }
    return { positions, speeds }
  }, [])

  useFrame(({ clock }, dt) => {
    const pts = ref.current
    if (!pts) return
    const arr = pts.geometry.attributes.position.array as Float32Array
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      arr[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.05
      arr[i * 3 + 1] += speeds[i] * dt
      if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = 0
    }
    pts.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#9fb4b0"
        size={0.035}
        transparent
        opacity={0.45}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

function Brazier({ position, seed }: { position: [number, number, number]; seed: number }) {
  const lightRef = useRef<THREE.PointLight>(null)

  const state = useRef({ v: 1, target: 1, t: Math.random() * 10 })

  useFrame((_, dt) => {
    const s = state.current
    s.t += dt
    // Wider target swing + dimmer base = moodier chiaroscuro.
    if (Math.random() < dt * 12) s.target = 0.6 + Math.random() * 0.7
    s.v += (s.target - s.v) * Math.min(1, dt * 10)
    const flutter = 1 + Math.sin((s.t + seed) * 13) * 0.06
    if (lightRef.current) lightRef.current.intensity = 2.7 * s.v * flutter
  })

  const bowlGeo = useMemo(() => new THREE.CylinderGeometry(0.42, 0.3, 0.22, 16, 1, false), [])

  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.8, 12]} />
        <meshStandardMaterial color="#1a1512" roughness={0.9} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.9, 0]} geometry={bowlGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#2c201a" roughness={0.7} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <torusGeometry args={[0.42, 0.04, 8, 24]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.5} metalness={0.8} />
      </mesh>
      <group position={[0, 1.0, 0]}>
        <Flame size={0.26} seed={seed} />
      </group>
      <pointLight
        ref={lightRef}
        position={[0, 1.3, 0]}
        intensity={2.7}
        distance={12}
        decay={2}
        color="#ffa258"
        castShadow
      />
    </group>
  )
}
