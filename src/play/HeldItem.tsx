import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Level, SceneObject } from '@/schema/level'
import { useWorld } from '@/state/world'
import { MeshBody } from '@/engine/SceneObjectView'
import { playerMotion } from './playerMotion'

// Rest-pose offset from camera: right, down, forward.
const HOLD_OFFSET = new THREE.Vector3(0.32, -0.26, -0.5)
// How far below the rest pose the item is parked when "stowed".
const STOW_DROP = new THREE.Vector3(0.0, -0.6, 0.0)
const SWAP_DURATION_S = 0.18

type Phase = 'stowed' | 'drawing' | 'held' | 'stowing'

export function HeldItem({ level }: { level: Level }) {
  const selectedItem = useWorld((s) => s.selectedItem)
  const inventory = useWorld((s) => s.inventory)
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const flame = useRef({ v: 1, target: 1 })

  // What is actually rendered right now (lags selectedItem through the stow animation).
  const [displayed, setDisplayed] = useState<string | null>(null)
  const phaseRef = useRef<Phase>('stowed')
  const swapRef = useRef(0) // 0 = fully stowed, 1 = fully drawn
  const timeRef = useRef(0)

  const effectiveSelected = selectedItem && inventory.includes(selectedItem) ? selectedItem : null

  // Drive the swap state machine when the selection target changes.
  useEffect(() => {
    if (displayed === effectiveSelected) {
      phaseRef.current = effectiveSelected ? 'held' : 'stowed'
      swapRef.current = effectiveSelected ? 1 : 0
      return
    }
    if (!displayed && effectiveSelected) {
      setDisplayed(effectiveSelected)
      phaseRef.current = 'drawing'
      swapRef.current = 0
    } else {
      // Need to stow current first; the swap-out tick below will swap displayed.
      phaseRef.current = 'stowing'
    }
  }, [effectiveSelected, displayed])

  const sourceObj: SceneObject | null = displayed ? findPickupObject(level, displayed) : null

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    timeRef.current += dt

    // Advance swap value based on phase.
    const step = dt / SWAP_DURATION_S
    if (phaseRef.current === 'drawing') {
      swapRef.current = Math.min(1, swapRef.current + step)
      if (swapRef.current >= 1) phaseRef.current = 'held'
    } else if (phaseRef.current === 'stowing') {
      swapRef.current = Math.max(0, swapRef.current - step)
      if (swapRef.current <= 0) {
        // Finished stowing. If a new selection waits, swap and draw.
        if (effectiveSelected && effectiveSelected !== displayed) {
          setDisplayed(effectiveSelected)
          phaseRef.current = 'drawing'
        } else {
          setDisplayed(null)
          phaseRef.current = 'stowed'
        }
      }
    } else if (phaseRef.current === 'held' && effectiveSelected !== displayed) {
      phaseRef.current = 'stowing'
    }

    const swap = easeOutCubic(swapRef.current)

    // Rest offset in camera space + stow drop (lerp down when swap<1).
    const t = timeRef.current
    const sway = new THREE.Vector3(
      Math.sin(t * 0.9) * 0.004,
      Math.sin(t * 1.3 + 0.5) * 0.003,
      0,
    )
    const bob = playerMotion.moving
      ? new THREE.Vector3(
          Math.cos(playerMotion.bobT * 0.5) * 0.02,
          Math.abs(Math.sin(playerMotion.bobT)) * -0.02,
          0,
        )
      : new THREE.Vector3()

    const stow = STOW_DROP.clone().multiplyScalar(1 - swap)
    const localOffset = HOLD_OFFSET.clone().add(sway).add(bob).add(stow)

    // World space: camera position + rotated offset.
    const worldOffset = localOffset.clone().applyQuaternion(camera.quaternion)
    g.position.copy(camera.position).add(worldOffset)
    g.quaternion.copy(camera.quaternion)

    // Slight downward tilt in local space so it reads more like a held object.
    g.rotateX(-0.25)
    g.rotateY(-0.1)

    // Scale with swap so it also eases in visually.
    // Base 2.5× so small source meshes (e.g. 8cm key) are legible in hand; a
    // lantern is already full size, and is held by its handle, so lower it.
    const isLantern = sourceObj?.mesh.kind === 'lantern'
    // A flat sheet (a letter) is held up facing you, and not blown up as far.
    const disc = sourceObj?.mesh.kind === 'primitive' && sourceObj.mesh.shape === 'cylinder' && sourceObj.mesh.size[1] < 0.05
    const flat = disc || (sourceObj?.mesh.kind === 'primitive' && sourceObj.mesh.shape === 'box' && sourceObj.mesh.size[1] < 0.02)
    if (flat) g.rotateX(Math.PI / 2 - 0.15)
    const s = (isLantern ? 0.95 : disc ? 1.7 : flat ? 1.2 : 2.5) * (0.4 + swap * 0.6)
    g.scale.setScalar(s)
    if (isLantern) g.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), 0.04 * swap)
  })

  // A lantern in hand lights the way. The light is always mounted (just dark
  // when nothing is held) so switching it on never recompiles the scene's shaders.
  useFrame((_, dt) => {
    const light = lightRef.current
    if (!light) return
    const g = groupRef.current
    const held = sourceObj?.mesh.kind === 'lantern' && g
    if (held) {
      const f = flame.current
      if (Math.random() < dt * 9) f.target = 0.85 + Math.random() * 0.3
      f.v += (f.target - f.v) * Math.min(1, dt * 12)
      const up = new THREE.Vector3(0, 0.16, 0).applyQuaternion(camera.quaternion)
      light.position.copy(g.position).add(up)
      light.intensity = 8 * f.v * easeOutCubic(swapRef.current)
    } else {
      light.intensity = 0
    }
  })

  return (
    <>
      <pointLight ref={lightRef} color="#ffb066" intensity={0} distance={18} decay={2} />
      {sourceObj && (
        <group ref={groupRef}>
          <MeshBody mesh={sourceObj.mesh} castShadow={false} receiveShadow={false} />
        </group>
      )}
    </>
  )
}

function findPickupObject(level: Level, itemId: string): SceneObject | null {
  for (const o of level.objects) {
    const b = o.interact?.behavior
    if (b?.type === 'pickup' && b.itemId === itemId) return o
  }
  return null
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}
