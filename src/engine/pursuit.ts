import * as THREE from 'three'
import type { AABB } from './collision'

/**
 * Shared state for the monster's pursuit. The monster sets `seenFrame` every
 * frame in which it can see the player; the PursuitDirector turns that into the
 * chase state, the music and the heartbeat.
 */
export const pursuit = {
  /** The monster could see the player in the most recent frame it checked. */
  seenFrame: false,
  /** A chase is on (it ends once the player has been out of sight for LOSE_AFTER_S). */
  chasing: false,
  /** 0 = calm, 1 = full chase; eased, and what the audio follows. */
  intensity: 0,
  /** Where she is in the world, and which way she faces (updated as she walks). */
  monster: { x: 0, z: 0, yaw: 0 },
  /** Where she last saw the player: what she runs to. */
  lastSeen: { x: 0, z: 0 },
}

/** Out of sight for this long and the chase is over. */
export const LOSE_AFTER_S = 10
/** How far she can see, in metres. */
export const SIGHT_RANGE = 26
/** Within this distance she notices you even from behind (she hears you), if nothing is in the way. */
export const DETECT_RANGE = 5.5
/** The same, if you're creeping along crouched. */
export const DETECT_RANGE_CROUCHED = 3.5

export function resetPursuit() {
  pursuit.seenFrame = false
  pursuit.chasing = false
  pursuit.intensity = 0
}

const tmpDir = new THREE.Vector3()

/** Does the segment from `a` to `b` pass through any of the boxes? (3D slab test.) */
export function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, boxes: AABB[]): boolean {
  tmpDir.subVectors(b, a)
  for (const box of boxes) {
    let tMin = 0
    let tMax = 1
    let hit = true
    for (const axis of ['x', 'y', 'z'] as const) {
      const d = tmpDir[axis]
      const o = a[axis]
      if (Math.abs(d) < 1e-9) {
        if (o < box.min[axis] || o > box.max[axis]) {
          hit = false
          break
        }
      } else {
        let t1 = (box.min[axis] - o) / d
        let t2 = (box.max[axis] - o) / d
        if (t1 > t2) [t1, t2] = [t2, t1]
        tMin = Math.max(tMin, t1)
        tMax = Math.min(tMax, t2)
        if (tMin > tMax) {
          hit = false
          break
        }
      }
    }
    if (hit) return true
  }
  return false
}

/**
 * Can something at `eye`, facing `forward`, see `target`? It sees anything in
 * the half-plane in front of it (its front 180°) within SIGHT_RANGE with no
 * solid in between.
 */
export function canSee(eye: THREE.Vector3, forward: THREE.Vector3, target: THREE.Vector3, blockers: AABB[]): boolean {
  const dx = target.x - eye.x
  const dz = target.z - eye.z
  const dist = Math.hypot(dx, dz)
  if (dist > SIGHT_RANGE) return false
  // In front of her: the flat angle to the target within ±90° of her facing.
  const fl = Math.hypot(forward.x, forward.z) || 1
  if ((dx * forward.x + dz * forward.z) / (fl * (dist || 1)) < 0) return false
  return !segmentHitsBox(eye, target, blockers)
}
