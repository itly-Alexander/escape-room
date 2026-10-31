import * as THREE from 'three'
import { Flame } from './Flame'

// A hand lantern: iron base and cap, four corner posts, a glass chimney with a
// small flame burning in an oil cup, and a carrying handle. Origin is the
// centre of the base; it stands about 0.38 m tall. It only glows (emissive); the
// light it throws when carried comes from the held-item code (HeldItem.tsx).
const IRON = '#1d1b19'

export function Lantern() {
  return (
    <group>
      {/* Base and oil cup */}
      <mesh position={[0, 0.014, 0]} castShadow>
        <cylinderGeometry args={[0.058, 0.064, 0.028, 16]} />
        <meshStandardMaterial color={IRON} metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.042, 0]}>
        <cylinderGeometry args={[0.022, 0.026, 0.03, 12]} />
        <meshStandardMaterial color="#6b5a3a" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Corner posts */}
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * 0.042, 0.158, sz * 0.042]} castShadow>
          <boxGeometry args={[0.01, 0.262, 0.01]} />
          <meshStandardMaterial color={IRON} metalness={0.8} roughness={0.5} />
        </mesh>
      ))}

      {/* Glass chimney */}
      <mesh position={[0, 0.158, 0]}>
        <boxGeometry args={[0.078, 0.25, 0.078]} />
        <meshStandardMaterial
          color="#ffd9a3"
          emissive="#ff9b3d"
          emissiveIntensity={0.55}
          transparent
          opacity={0.3}
          roughness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* Flame */}
      <group position={[0, 0.1, 0]}>
        <Flame size={0.034} seed={3.3} />
      </group>

      {/* Cap, ring and handle */}
      <mesh position={[0, 0.305, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.07, 0.05, 4]} />
        <meshStandardMaterial color={IRON} metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.338, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.018, 10]} />
        <meshStandardMaterial color={IRON} metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.346, 0]} castShadow>
        <torusGeometry args={[0.052, 0.0038, 8, 24, Math.PI]} />
        <meshStandardMaterial color={IRON} metalness={0.8} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
