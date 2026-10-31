// An old iron door key, standing upright in the XY plane (bow at the top, bit at
// the bottom) and facing +z. Origin is the middle of the shaft; about 0.17 m tall.
const IRON = '#a8873a' // old tarnished brass, so it shows against the dark wood

export function IronKey() {
  return (
    <group>
      {/* Bow: a ring, built from a few short bars */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.026, 0.1 + Math.sin(a) * 0.026, 0]} rotation={[0, 0, a + Math.PI / 2]} castShadow>
            <boxGeometry args={[0.024, 0.009, 0.012]} />
            <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.4} />
          </mesh>
        )
      })}
      {/* Collar and shaft */}
      <mesh position={[0, 0.062, 0]} castShadow>
        <boxGeometry args={[0.03, 0.012, 0.016]} />
        <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.012, 0.13, 0.012]} />
        <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Bit */}
      <mesh position={[0.016, -0.05, 0]} castShadow>
        <boxGeometry args={[0.024, 0.02, 0.01]} />
        <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.012, -0.075, 0]} castShadow>
        <boxGeometry args={[0.016, 0.016, 0.01]} />
        <meshStandardMaterial color={IRON} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}
