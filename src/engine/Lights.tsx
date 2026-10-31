import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Light } from '@/schema/level'
import { watch } from './watch'

// Forward-rendered lights are paid for per pixel, and each shadow-casting point
// light also needs a texture unit. A big level can have dozens of point lights,
// so beyond this many we render only a fixed pool and reassign it each frame to
// whichever lights matter most to the player right now. The pool size never
// changes, so the shaders are never recompiled.
const DIRECT_POINT_LIMIT = 18
const SHADOW_SLOTS = 6
const PLAIN_SLOTS = 12

export function LevelLights({ lights }: { lights: Light[] }) {
  const { points, pooled, direct } = useMemo(() => {
    const points = lights.filter((l) => l.type === 'point')
    const pooled = points.length > DIRECT_POINT_LIMIT
    return { points, pooled, direct: pooled ? lights.filter((l) => l.type !== 'point') : lights }
  }, [lights])
  return (
    <>
      {direct.map((l) => (
        <LightOne key={l.id} light={l} />
      ))}
      {pooled && <PointLightPool lights={points} />}
    </>
  )
}

type FlickerState = { v: number; target: number; t: number }

function PointLightPool({ lights }: { lights: Light[] }) {
  const { camera } = useThree()
  const shadowRefs = useRef<(THREE.PointLight | null)[]>([])
  const plainRefs = useRef<(THREE.PointLight | null)[]>([])
  const shadowIds = useRef<(string | null)[]>(Array(SHADOW_SLOTS).fill(null))
  const plainIds = useRef<(string | null)[]>(Array(PLAIN_SLOTS).fill(null))
  const flicker = useRef(new Map<string, FlickerState>())

  const shadowLights = useMemo(() => lights.filter((l) => l.castShadow), [lights])
  const plainLights = useMemo(() => lights.filter((l) => !l.castShadow), [lights])

  const fill = (
    candidates: Light[],
    slotRefs: (THREE.PointLight | null)[],
    ids: (string | null)[],
    dt: number,
  ) => {
    // Rank by how much light would reach the player, so a dim candle beside
    // you outranks a bright sconce three rooms away.
    const scored = candidates
      .map((l) => {
        const dx = l.position[0] - camera.position.x
        const dy = l.position[1] - camera.position.y
        const dz = l.position[2] - camera.position.z
        return { l, score: l.intensity / (dx * dx + dy * dy + dz * dz + 1) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, ids.length)
    const want = new Set(scored.map((x) => x.l.id))
    // Keep lights in the slots they already have so nothing swaps needlessly.
    for (let i = 0; i < ids.length; i++) if (ids[i] && !want.has(ids[i]!)) ids[i] = null
    for (const { l } of scored) {
      if (ids.includes(l.id)) continue
      const free = ids.indexOf(null)
      if (free >= 0) ids[free] = l.id
    }
    for (let i = 0; i < ids.length; i++) {
      const slot = slotRefs[i]
      if (!slot) continue
      const l = ids[i] ? candidates.find((c) => c.id === ids[i]) : undefined
      if (!l) {
        slot.intensity = 0
        continue
      }
      slot.position.set(...l.position)
      slot.color.set(l.color)
      slot.distance = l.distance ?? 0
      let intensity = l.intensity
      if (l.flicker) {
        let s = flicker.current.get(l.id)
        if (!s) {
          s = { v: 1, target: 1, t: Math.random() * 10 }
          flicker.current.set(l.id, s)
        }
        s.t += dt
        const speed = l.flicker.speed
        if (Math.random() < dt * speed) s.target = 1 + (Math.random() * 2 - 1) * l.flicker.amount
        s.v += (s.target - s.v) * Math.min(1, dt * 12)
        intensity = l.intensity * s.v * (1 + Math.sin(s.t * speed * 1.3) * l.flicker.amount * 0.15)
      }
      slot.intensity = l.circuit ? intensity * watch.power : intensity
    }
  }

  useFrame((_, dt) => {
    fill(shadowLights, shadowRefs.current, shadowIds.current, dt)
    fill(plainLights, plainRefs.current, plainIds.current, dt)
  })

  return (
    <>
      {Array.from({ length: SHADOW_SLOTS }, (_, i) => (
        <pointLight
          key={`s${i}`}
          ref={(r) => (shadowRefs.current[i] = r)}
          intensity={0}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      ))}
      {Array.from({ length: PLAIN_SLOTS }, (_, i) => (
        <pointLight key={`p${i}`} ref={(r) => (plainRefs.current[i] = r)} intensity={0} />
      ))}
    </>
  )
}

function LightOne({ light }: { light: Light }) {
  const target = useMemo(() => {
    if (!light.target) return null
    const o = new THREE.Object3D()
    o.position.set(...light.target)
    return o
  }, [light.target])

  const lightRef = useRef<THREE.PointLight | THREE.SpotLight>(null)
  const flickerState = useRef({ v: 1, target: 1, t: Math.random() * 10 })

  useFrame((_, dt) => {
    if (!lightRef.current) return
    // On the house circuit it follows the power, flickering or not.
    const power = light.circuit ? watch.power : 1
    if (!light.flicker) {
      if (light.circuit) lightRef.current.intensity = light.intensity * power
      return
    }
    const s = flickerState.current
    s.t += dt
    const speed = light.flicker.speed
    if (Math.random() < dt * speed) {
      s.target = 1 + (Math.random() * 2 - 1) * light.flicker.amount
    }
    s.v += (s.target - s.v) * Math.min(1, dt * 12)
    const flutter = 1 + Math.sin(s.t * speed * 1.3) * light.flicker.amount * 0.15
    lightRef.current.intensity = light.intensity * s.v * flutter * power
  })

  switch (light.type) {
    case 'ambient':
      return <ambientLight color={light.color} intensity={light.intensity} />
    case 'point':
      return (
        <pointLight
          ref={lightRef as React.Ref<THREE.PointLight>}
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          castShadow={light.castShadow}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      )
    case 'spot':
      return (
        <>
          <spotLight
            ref={lightRef as React.Ref<THREE.SpotLight>}
            position={light.position}
            color={light.color}
            intensity={light.intensity}
            distance={light.distance}
            angle={light.angle ?? Math.PI / 6}
            penumbra={light.penumbra ?? 0.3}
            castShadow={light.castShadow}
            target={target ?? undefined}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          {target && <primitive object={target} />}
        </>
      )
    case 'directional':
      return (
        <>
          <directionalLight
            position={light.position}
            color={light.color}
            intensity={light.intensity}
            castShadow={light.castShadow}
            target={target ?? undefined}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          {target && <primitive object={target} />}
        </>
      )
  }
}
