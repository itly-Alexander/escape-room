import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { watch } from './watch'

// A bare bulb on a twisted flex hanging `drop` metres from the ceiling. The
// object's position is the ceiling rose. The glass glows with the house power,
// so it dims and dies along with the lights in a blackout.
export function Bulb({ drop, color }: { drop: number; color: string }) {
  const glass = useRef<THREE.MeshStandardMaterial>(null)
  const sway = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (glass.current) glass.current.emissiveIntensity = 2.4 * watch.power
    // A faint draught.
    if (sway.current) sway.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.012
  })
  return (
    <group ref={sway}>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
        <meshStandardMaterial color="#2a2622" roughness={0.6} />
      </mesh>
      <mesh position={[0, -drop / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, drop, 6]} />
        <meshStandardMaterial color="#141210" roughness={0.8} />
      </mesh>
      <mesh position={[0, -drop - 0.03, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.05, 12]} />
        <meshStandardMaterial color="#6a5a3a" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, -drop - 0.1, 0]} scale={[1, 1.25, 1]}>
        <sphereGeometry args={[0.045, 20, 14]} />
        <meshStandardMaterial ref={glass} color="#fff2d8" emissive={color} emissiveIntensity={2.4} roughness={0.2} transparent opacity={0.92} />
      </mesh>
    </group>
  )
}
