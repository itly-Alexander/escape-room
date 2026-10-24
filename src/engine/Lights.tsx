import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Light } from '@/schema/level'

export function LevelLights({ lights }: { lights: Light[] }) {
  return (
    <>
      {lights.map((l) => (
        <LightOne key={l.id} light={l} />
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
    if (!light.flicker || !lightRef.current) return
    const s = flickerState.current
    s.t += dt
    const speed = light.flicker.speed
    if (Math.random() < dt * speed) {
      s.target = 1 + (Math.random() * 2 - 1) * light.flicker.amount
    }
    s.v += (s.target - s.v) * Math.min(1, dt * 12)
    const flutter = 1 + Math.sin(s.t * speed * 1.3) * light.flicker.amount * 0.15
    lightRef.current.intensity = light.intensity * s.v * flutter
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
