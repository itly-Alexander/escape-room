import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Level } from '@/schema/level'
import { computeAABB, moveWithCollision, type AABB } from '@/engine/collision'
import { playerMotion } from './playerMotion'
import { useWorld, type HideSpot } from '@/state/world'

const WALK_SPEED = 3.6
const SPRINT_SPEED = 4.2 // only marginally faster than walking
const CROUCH_SPEED = 1.7
const EYE_HEIGHT = 1.7
const CROUCH_HEIGHT = 1.1
const RADIUS = 0.35
const BODY_BOTTOM = 0.05
const BODY_TOP = 1.85
const CROUCH_BODY_TOP = 1.25

const keys = { forward: false, back: false, left: false, right: false, crouch: false, sprint: false }

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
    case 'KeyC':
      keys.crouch = down
      break
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.sprint = down
      break
  }
}

// ---- Hiding under a table ------------------------------------------------
// Entering: duck to hands and knees at the table's mouth, crawl in, turn round
// and settle looking out. Leaving is the same in reverse, ending standing in
// front of the table. The camera is driven directly while this plays.
const ENTER_DROP = 0.9 // seconds: duck down and step to the mouth
const ENTER_CRAWL = 1.2 // seconds: crawl in
const ENTER_SIT = 0.9 // seconds: turn round and settle
const LEAVE_CRAWL = 1.0
const LEAVE_STAND = 0.9
const CRAWL_HEIGHT = 0.5
const HIDE_YAW_RANGE = 1.0 // radians either side of straight out while hidden
const HIDE_PITCH_MIN = -0.7
const HIDE_PITCH_MAX = 0.55

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const shortestAngle = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
const v3 = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2])

type HideAnim = { phase: 'entering' | 'leaving'; t: number; from: THREE.Vector3; yaw0: number; pitch0: number }

export function FPSController({ level, locked }: { level: Level; locked: boolean }) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const bobT = useRef(0)
  const pos = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpDelta = useRef(new THREE.Vector3())
  const anim = useRef<HideAnim | null>(null)
  const lastHidePhase = useRef<string | null>(null)
  const tmpEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  const { fixedBoxes, doors } = useMemo(() => {
    const solid = level.objects.filter((o) => o.isSolid)
    const door = (o: (typeof solid)[number]) => !!o.pose?.unblocksWhenOpen
    return {
      fixedBoxes: solid.filter((o) => !door(o)).map(computeAABB),
      // Solid only while closed.
      doors: solid.filter(door).map((o) => ({ stateId: o.pose!.stateId, box: computeAABB(o) })),
    }
  }, [level])
  const solidBoxes = useRef<AABB[]>(fixedBoxes)
  const doorKey = useRef('')

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
      keys.forward = keys.back = keys.left = keys.right = keys.crouch = keys.sprint = false
    }
  }, [locked])

  const setCamera = (p: THREE.Vector3, yaw: number, pitch: number, roll = 0) => {
    camera.position.copy(p)
    camera.quaternion.setFromEuler(tmpEuler.current.set(pitch, yaw, roll, 'YXZ'))
    playerMotion.moving = false
    playerMotion.crouching = true
    playerMotion.posX = p.x
    playerMotion.posY = p.y
    playerMotion.posZ = p.z
    playerMotion.yaw = yaw
  }

  const stepHide = (dt: number, spot: HideSpot, phase: 'entering' | 'hidden' | 'leaving') => {
    const edge = v3(spot.edge)
    const deep = v3(spot.deep)
    const end = v3(spot.spot)
    const yawIn = spot.outYaw + Math.PI // facing into the hiding place

    if (phase !== lastHidePhase.current) {
      lastHidePhase.current = phase
      if (phase === 'entering' || phase === 'leaving') {
        const e = tmpEuler.current.setFromQuaternion(camera.quaternion, 'YXZ')
        anim.current = { phase, t: 0, from: camera.position.clone(), yaw0: e.y, pitch0: e.x }
        keys.forward = keys.back = keys.left = keys.right = keys.crouch = keys.sprint = false
      } else {
        anim.current = null
      }
    }

    const a = anim.current
    if (phase === 'entering' && a) {
      a.t += dt
      const t = a.t
      if (t < ENTER_DROP) {
        // Duck and step to the table's mouth, eyes turning to the gap.
        const u = ease(t / ENTER_DROP)
        const p = new THREE.Vector3(lerp(a.from.x, edge.x, u), lerp(a.from.y, CRAWL_HEIGHT + 0.12, u), lerp(a.from.z, edge.z, u))
        setCamera(p, a.yaw0 + shortestAngle(a.yaw0, yawIn) * u, lerp(a.pitch0, -0.3, u))
      } else if (t < ENTER_DROP + ENTER_CRAWL) {
        // Crawl in: hand-over-hand lurches, with a sway.
        const u = (t - ENTER_DROP) / ENTER_CRAWL
        const s = u - 0.04 * Math.sin(u * Math.PI * 6)
        const stride = Math.sin(u * Math.PI * 6)
        const p = new THREE.Vector3(lerp(edge.x, deep.x, s), CRAWL_HEIGHT + 0.03 * Math.abs(stride), lerp(edge.z, deep.z, s))
        // Sway sideways, across the direction of travel.
        const sway = 0.025 * stride
        p.x += Math.cos(yawIn) * sway
        p.z -= Math.sin(yawIn) * sway
        setCamera(p, yawIn + 0.05 * stride, -0.3 + 0.03 * Math.abs(stride), 0.035 * stride)
      } else {
        // Turn right round and edge forward to sit looking out.
        const u = Math.min(1, (t - ENTER_DROP - ENTER_CRAWL) / ENTER_SIT)
        const p = new THREE.Vector3(
          lerp(deep.x, end.x, ease((u - 0.35) / 0.65)),
          lerp(CRAWL_HEIGHT, end.y, ease(u)),
          lerp(deep.z, end.z, ease((u - 0.35) / 0.65)),
        )
        setCamera(p, yawIn + Math.PI * ease(u), lerp(-0.3, -0.06, ease(u)))
        if (u >= 1) {
          useWorld.getState().setHidePhase('hidden')
          anim.current = null
        }
      }
    } else if (phase === 'leaving' && a) {
      a.t += dt
      const t = a.t
      if (t < LEAVE_CRAWL) {
        // Crawl back out, still facing out.
        const u = t / LEAVE_CRAWL
        const s = ease(u) - 0.03 * Math.sin(u * Math.PI * 4)
        const stride = Math.sin(u * Math.PI * 4)
        const p = new THREE.Vector3(lerp(a.from.x, edge.x, s), lerp(a.from.y, CRAWL_HEIGHT + 0.1, ease(u)) + 0.025 * Math.abs(stride), lerp(a.from.z, edge.z, s))
        const e = ease(u)
        setCamera(p, a.yaw0 + shortestAngle(a.yaw0, spot.outYaw) * e + 0.04 * stride, lerp(a.pitch0, -0.25, e), 0.03 * stride)
      } else {
        // Stand up in front of the table.
        const u = Math.min(1, (t - LEAVE_CRAWL) / LEAVE_STAND)
        const e = ease(u)
        const p = new THREE.Vector3(lerp(edge.x, spot.exit[0], e), lerp(CRAWL_HEIGHT + 0.1, EYE_HEIGHT, e), lerp(edge.z, spot.exit[2], e))
        setCamera(p, spot.outYaw, lerp(-0.25, 0, e))
        if (u >= 1) {
          pos.current.set(spot.exit[0], EYE_HEIGHT, spot.exit[2])
          playerMotion.crouching = false
          anim.current = null
          lastHidePhase.current = null
          useWorld.getState().endHide()
        }
      }
    } else if (phase === 'hidden') {
      // Sitting: breathe, and look around a little, always out through the gap.
      const e = tmpEuler.current.setFromQuaternion(camera.quaternion, 'YXZ')
      const yaw = spot.outYaw + Math.max(-HIDE_YAW_RANGE, Math.min(HIDE_YAW_RANGE, shortestAngle(spot.outYaw, e.y)))
      const pitch = Math.max(HIDE_PITCH_MIN, Math.min(HIDE_PITCH_MAX, e.x))
      const t = performance.now() / 1000
      setCamera(new THREE.Vector3(end.x, end.y + Math.sin(t * 1.4) * 0.006, end.z), yaw, pitch)
    }
  }

  useFrame((_, rawDt) => {
    // Cap the step so a hitch (or a slow machine) can't carry the player clean
    // through a thin wall or door in one frame.
    const dt = Math.min(rawDt, 0.05)
    const hide = useWorld.getState().hide
    if (!hide) lastHidePhase.current = null
    if (!locked) return
    if (hide) {
      stepHide(dt, hide.spot, hide.phase)
      return
    }
    const forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    const strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const speed = keys.crouch ? CROUCH_SPEED : keys.sprint ? SPRINT_SPEED : WALK_SPEED
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

    // Rebuild the obstacle list only when a door opens or closes.
    if (doors.length) {
      const flags = useWorld.getState().flags
      const key = doors.map((d) => (flags[d.stateId] ? '1' : '0')).join('')
      if (key !== doorKey.current) {
        doorKey.current = key
        solidBoxes.current = [...fixedBoxes, ...doors.filter((d) => !flags[d.stateId]).map((d) => d.box)]
      }
    } else if (solidBoxes.current !== fixedBoxes) {
      solidBoxes.current = fixedBoxes
    }

    const moving = forward !== 0 || strafe !== 0
    if (moving) {
      const top = keys.crouch ? CROUCH_BODY_TOP : BODY_TOP
      const next = moveWithCollision(pos.current, tmpDelta.current, RADIUS, BODY_BOTTOM, top, solidBoxes.current)
      pos.current.copy(next)
    }

    // Eye height smoothing + headbob
    const alpha = 1 - Math.exp(-dt / 0.08)
    pos.current.y += (targetEye - pos.current.y) * alpha
    bobT.current += moving ? dt * (keys.crouch ? 6 : keys.sprint ? 10 : 9) : 0
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
