import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Level } from '@/schema/level'
import { computeAABB, moveWithCollision, type AABB } from '@/engine/collision'
import { playerMotion } from './playerMotion'

const WALK_SPEED = 3.6
const CROUCH_SPEED = 1.7
const EYE_HEIGHT = 1.7
const CROUCH_HEIGHT = 1.1
const RADIUS = 0.35
const BODY_BOTTOM = 0.05
const BODY_TOP = 1.85
const CROUCH_BODY_TOP = 1.25

const keys = { forward: false, back: false, left: false, right: false, crouch: false }

function setKey(code: string, down: boolean) {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      keys.forward = down
      break
    case 'KeyS':
    case 'ArrowDown':
      keys.back = down
      break
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = down
      break
    case 'KeyD':
    case 'ArrowRight':
      keys.right = down
      break
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.crouch = down
      break
  }
}

export function FPSController({ level, locked }: { level: Level; locked: boolean }) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const bobT = useRef(0)
  const pos = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpDelta = useRef(new THREE.Vector3())

  const solidBoxes = useMemo<AABB[]>(() => {
    return level.objects.filter((o) => o.isSolid).map(computeAABB)
  }, [level])

  // Initial placement
  useEffect(() => {
    const [x, , z] = level.playerStart.position
    pos.current.set(x, EYE_HEIGHT, z)
    camera.position.copy(pos.current)
    camera.rotation.set(0, level.playerStart.rotationY, 0)
  }, [camera, level])

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => setKey(e.code, true)
    const onUp = (e: KeyboardEvent) => setKey(e.code, false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // Clear any stuck keys when losing pointer lock (e.g. Esc / alt-tab).
  useEffect(() => {
    if (!locked) {
      keys.forward = keys.back = keys.left = keys.right = keys.crouch = false
    }
  }, [locked])

  useFrame((_, dt) => {
    if (!locked) return
    const forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const speed = keys.crouch ? CROUCH_SPEED : WALK_SPEED
    const targetEye = keys.crouch ? CROUCH_HEIGHT : EYE_HEIGHT

    tmpDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    tmpDir.current.y = 0
    tmpDir.current.normalize()
    tmpRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
    tmpRight.current.y = 0
    tmpRight.current.normalize()

    tmpDelta.current
      .set(0, 0, 0)
      .addScaledVector(tmpDir.current, forward * speed * dt)
      .addScaledVector(tmpRight.current, strafe * speed * dt)

    const moving = forward !== 0 || strafe !== 0
    if (moving) {
      const top = keys.crouch ? CROUCH_BODY_TOP : BODY_TOP
      const next = moveWithCollision(pos.current, tmpDelta.current, RADIUS, BODY_BOTTOM, top, solidBoxes)
      pos.current.copy(next)
    }

    // Eye height smoothing + headbob
    const alpha = 1 - Math.exp(-dt / 0.08)
    pos.current.y += (targetEye - pos.current.y) * alpha
    bobT.current += moving ? dt * (keys.crouch ? 6 : 9) : 0
    const bob = moving ? Math.sin(bobT.current) * 0.025 : 0
    camera.position.set(pos.current.x, pos.current.y + bob, pos.current.z)

    playerMotion.moving = moving
    playerMotion.bobT = bobT.current
    playerMotion.crouching = keys.crouch
    playerMotion.posX = camera.position.x
    playerMotion.posY = camera.position.y
    playerMotion.posZ = camera.position.z
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    playerMotion.yaw = e.y
  })

  return <PointerLockControls ref={controlsRef} />
}
