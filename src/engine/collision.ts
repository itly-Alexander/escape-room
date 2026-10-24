import * as THREE from 'three'
import type { SceneObject } from '@/schema/level'

export type AABB = { min: THREE.Vector3; max: THREE.Vector3 }

/**
 * Compute a world-space AABB for a scene object from its primitive geometry + transform.
 * GLTF models use a fallback unit cube until the loader is wired.
 * Rotation is handled by expanding the box around the rotated local extents.
 */
export function computeAABB(obj: SceneObject): AABB {
  const [sx, sy, sz] = obj.transform.scale
  let halfX = 0.5, halfY = 0.5, halfZ = 0.5
  if (obj.mesh.kind === 'primitive') {
    const [w, h, d] = obj.mesh.size
    switch (obj.mesh.shape) {
      case 'box':
        halfX = w / 2
        halfY = h / 2
        halfZ = d / 2
        break
      case 'cylinder':
        halfX = w / 2
        halfY = h / 2
        halfZ = w / 2
        break
      case 'plane':
        halfX = w / 2
        halfY = 0.01
        halfZ = d / 2
        break
      case 'sphere':
        halfX = halfY = halfZ = w / 2
        break
    }
  }
  const local = new THREE.Vector3(halfX * sx, halfY * sy, halfZ * sz)

  const rot = new THREE.Euler(...obj.transform.rotation)
  const q = new THREE.Quaternion().setFromEuler(rot)
  const corners = [
    new THREE.Vector3(+local.x, +local.y, +local.z),
    new THREE.Vector3(-local.x, +local.y, +local.z),
    new THREE.Vector3(+local.x, -local.y, +local.z),
    new THREE.Vector3(-local.x, -local.y, +local.z),
    new THREE.Vector3(+local.x, +local.y, -local.z),
    new THREE.Vector3(-local.x, +local.y, -local.z),
    new THREE.Vector3(+local.x, -local.y, -local.z),
    new THREE.Vector3(-local.x, -local.y, -local.z),
  ]
  const center = new THREE.Vector3(...obj.transform.position)
  const min = new THREE.Vector3(+Infinity, +Infinity, +Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  for (const c of corners) {
    c.applyQuaternion(q).add(center)
    min.min(c)
    max.max(c)
  }
  return { min, max }
}

const EPS = 0.0005

/**
 * Resolve cylinder-vs-AABBs using closest-point push-out.
 * For each colliding box, push the player along the vector from the box's
 * closest point to the player center. This handles corner approaches
 * correctly (no "teleport across the obstacle" artifact).
 *
 * The player occupies a vertical range [bodyBottom, bodyTop] (world Y),
 * independent of eye height.
 */
export function moveWithCollision(
  pos: THREE.Vector3,
  delta: THREE.Vector3,
  radius: number,
  bodyBottom: number,
  bodyTop: number,
  boxes: AABB[],
): THREE.Vector3 {
  const next = pos.clone()
  next.x += delta.x
  next.z += delta.z

  // Two passes handle rare cases where correcting against box A pushes
  // the player into box B.
  for (let pass = 0; pass < 2; pass++) {
    let anyFix = false
    for (const b of boxes) {
      if (bodyTop < b.min.y) continue
      if (bodyBottom > b.max.y) continue

      const px = Math.max(b.min.x, Math.min(next.x, b.max.x))
      const pz = Math.max(b.min.z, Math.min(next.z, b.max.z))
      const dx = next.x - px
      const dz = next.z - pz
      const d2 = dx * dx + dz * dz

      if (d2 >= radius * radius) continue

      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        const push = (radius - d + EPS) / d
        next.x += dx * push
        next.z += dz * push
      } else {
        // Degenerate: center is exactly at the closest point (on an edge or inside).
        // Pop out along the shortest axis.
        const toMinX = next.x - b.min.x
        const toMaxX = b.max.x - next.x
        const toMinZ = next.z - b.min.z
        const toMaxZ = b.max.z - next.z
        const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ)
        if (m === toMinX) next.x = b.min.x - radius - EPS
        else if (m === toMaxX) next.x = b.max.x + radius + EPS
        else if (m === toMinZ) next.z = b.min.z - radius - EPS
        else next.z = b.max.z + radius + EPS
      }
      anyFix = true
    }
    if (!anyFix) break
  }

  return next
}
