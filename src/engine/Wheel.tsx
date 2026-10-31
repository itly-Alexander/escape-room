import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorld } from '@/state/world'

// An iron hand-wheel on a wall plate, facing +z. Turning it (hold E: the
// `crank` behaviour) creeps a gauge needle round; only when it's gone all the
// way does the shutter over the little window snap up and show the colour.
// Half-turned, it tells you nothing.

const TURNS = 5 // full turns of the wheel from start to done
const IRON = '#2b2826'
const WIN_Y = 0.31 // height of the colour window's centre on the plate

const labelCache = new Map<string, THREE.CanvasTexture>()
function labelTexture(label: string) {
  const hit = labelCache.get(label)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#d8c9a0'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#3a2e1c'
  g.lineWidth = 6
  g.strokeRect(6, 6, 244, 116)
  g.fillStyle = '#2a1e10'
  g.font = 'bold 84px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(label, 128, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  labelCache.set(label, t)
  return t
}

export function Wheel({ valueId, color, label }: { valueId: string; color: string; label: string }) {
  const wheel = useRef<THREE.Group>(null)
  const needle = useRef<THREE.Group>(null)
  const shutter = useRef<THREE.Mesh>(null)
  const lens = useRef<THREE.MeshStandardMaterial>(null)
  const shown = useRef(0)
  const spokes = useMemo(() => Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI), [])

  useFrame((_, dt) => {
    const v = useWorld.getState().values[valueId] ?? 0
    // Ease toward the true value so the turning looks smooth.
    shown.current += (v - shown.current) * (1 - Math.exp(-dt / 0.06))
    const p = shown.current
    if (wheel.current) wheel.current.rotation.z = -p * TURNS * Math.PI * 2
    if (needle.current) needle.current.rotation.z = Math.PI / 2 - p * Math.PI
    const open = v >= 1
    if (shutter.current) {
      // Rolls up into the slot over the window, like a blind.
      const sh = shutter.current
      const k = 1 - Math.exp(-dt / 0.08)
      sh.scale.y += ((open ? 0.04 : 1) - sh.scale.y) * k
      sh.position.y = WIN_Y + 0.12 * (1 - sh.scale.y)
    }
    if (lens.current) lens.current.emissiveIntensity = open ? 0.9 : 0
  })

  return (
    <group>
      {/* Wall plate, with the numeral at the top. */}
      <mesh position={[0, 0, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.3, 0.04]} />
        <meshStandardMaterial color={IRON} roughness={0.6} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.54, 0.045]}>
        <planeGeometry args={[0.3, 0.15]} />
        <meshStandardMaterial map={labelTexture(label)} roughness={0.9} />
      </mesh>
      {/* The window and its colour. */}
      <mesh position={[0, WIN_Y, 0.042]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial ref={lens} color={color} emissive={color} emissiveIntensity={0} roughness={0.4} />
      </mesh>
      <mesh position={[0, WIN_Y, 0.05]} ref={shutter}>
        <boxGeometry args={[0.34, 0.24, 0.012]} />
        <meshStandardMaterial color="#4a4038" roughness={0.5} metalness={0.7} />
      </mesh>
      {/* The slot over the window that the shutter rolls up into. */}
      <mesh position={[0, WIN_Y + 0.13, 0.06]}>
        <boxGeometry args={[0.4, 0.04, 0.04]} />
        <meshStandardMaterial color={IRON} roughness={0.5} metalness={0.7} />
      </mesh>
      {/* Gauge: a half-dial with a needle that creeps from left to right. */}
      <mesh position={[0, 0.08, 0.042]}>
        <circleGeometry args={[0.13, 32, 0, Math.PI]} />
        <meshStandardMaterial color="#d8c9a0" roughness={0.9} />
      </mesh>
      <group ref={needle} position={[0, 0.08, 0.046]}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.012, 0.12, 0.004]} />
          <meshStandardMaterial color="#7a1a10" />
        </mesh>
      </group>
      {/* The wheel itself, on an axle out from the plate. */}
      <mesh position={[0, -0.32, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.14, 12]} />
        <meshStandardMaterial color={IRON} roughness={0.4} metalness={0.8} />
      </mesh>
      <group ref={wheel} position={[0, -0.32, 0.17]}>
        <mesh castShadow>
          <torusGeometry args={[0.27, 0.025, 10, 40]} />
          <meshStandardMaterial color="#5a2a1c" roughness={0.45} metalness={0.6} />
        </mesh>
        {spokes.map((a) => (
          <mesh key={a} rotation={[0, 0, a]}>
            <boxGeometry args={[0.54, 0.025, 0.02]} />
            <meshStandardMaterial color="#5a2a1c" roughness={0.45} metalness={0.6} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
          <meshStandardMaterial color="#8a6a3a" roughness={0.3} metalness={0.9} />
        </mesh>
        {/* A handle on the rim. */}
        <mesh position={[0.27, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.12, 10]} />
          <meshStandardMaterial color="#3a2414" roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

const OFF = new THREE.Color('#141210')

// A brass knob under a round coloured lens, facing +z. Each turn steps the lens
// on to the next colour; it's dark until it's first turned.
export function Dial({ valueId, colors, label }: { valueId: string; colors: string[]; label: string }) {
  const knob = useRef<THREE.Group>(null)
  const lens = useRef<THREE.MeshStandardMaterial>(null)
  const turn = useRef(0)
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    const v = useWorld.getState().values[valueId]
    const goal = v === undefined ? 0 : ((v + 1) / colors.length) * Math.PI * 2
    turn.current += (goal - turn.current) * (1 - Math.exp(-dt / 0.07))
    if (knob.current) knob.current.rotation.z = -turn.current
    if (lens.current) {
      if (v === undefined) {
        lens.current.color.copy(OFF)
        lens.current.emissiveIntensity = 0
      } else {
        tmp.set(colors[v % colors.length])
        lens.current.color.copy(tmp)
        lens.current.emissive.copy(tmp)
        lens.current.emissiveIntensity = 0.8
      }
    }
  })

  return (
    <group>
      <mesh position={[0, 0, 0.01]} castShadow>
        <boxGeometry args={[0.2, 0.34, 0.02]} />
        <meshStandardMaterial color="#8a6a32" roughness={0.35} metalness={0.85} />
      </mesh>
      {label && (
        <mesh position={[0, 0.25, 0.012]}>
          <planeGeometry args={[0.16, 0.08]} />
          <meshStandardMaterial map={labelTexture(label)} roughness={0.9} />
        </mesh>
      )}
      <mesh position={[0, 0.08, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.03, 24]} />
        <meshStandardMaterial ref={lens} color="#141210" emissive="#000000" roughness={0.2} />
      </mesh>
      <group ref={knob} position={[0, -0.07, 0.03]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.04, 20]} />
          <meshStandardMaterial color="#b8903a" roughness={0.3} metalness={0.9} />
        </mesh>
        {/* A pointer ridge across the knob, so you can see it turn. */}
        <mesh position={[0, 0.02, 0.022]}>
          <boxGeometry args={[0.012, 0.06, 0.012]} />
          <meshStandardMaterial color="#4a3416" roughness={0.5} metalness={0.6} />
        </mesh>
      </group>
    </group>
  )
}
