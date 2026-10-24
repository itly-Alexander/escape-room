import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Level, SceneObject } from '@/schema/level'
import { tryInteract } from '@/engine/interact'
import { useWorld } from '@/state/world'

const MAX_INTERACT_DIST = 2.6
const raycaster = new THREE.Raycaster()
const screenCenter = new THREE.Vector2(0, 0)

export type ReticleTarget = {
  object: SceneObject
  prompt: string
  distance: number
}

type Props = {
  level: Level
  enabled: boolean
  onTargetChange: (t: ReticleTarget | null) => void
  onCodeRequest: (objectId: string) => void
}

export function InteractReticle({ level, enabled, onTargetChange, onCodeRequest }: Props) {
  const { camera, scene } = useThree()
  const currentRef = useRef<ReticleTarget | null>(null)
  const [, force] = useState(0)

  useFrame(() => {
    if (!enabled) {
      if (currentRef.current) {
        currentRef.current = null
        onTargetChange(null)
        force((n) => n + 1)
      }
      return
    }
    raycaster.setFromCamera(screenCenter, camera)
    const hits = raycaster.intersectObjects(scene.children, true)
    let found: ReticleTarget | null = null
    for (const hit of hits) {
      if (hit.distance > MAX_INTERACT_DIST) break
      const id = findSceneObjectId(hit.object)
      if (!id) continue
      const obj = level.objects.find((o) => o.id === id)
      if (!obj) continue
      // Closest scene object wins. If it has no interact, physical occlusion
      // prevents reaching anything behind it (e.g. a closed chest lid hiding
      // a key inside).
      if (obj.interact) {
        found = { object: obj, prompt: promptFor(obj), distance: hit.distance }
      }
      break
    }
    const cur = currentRef.current
    const changed =
      (!cur && found) ||
      (cur && !found) ||
      (cur && found && cur.object.id !== found.object.id)
    if (changed) {
      currentRef.current = found
      onTargetChange(found)
      force((n) => n + 1)
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabled) return
      if (e.code !== 'KeyE' && e.code !== 'Space') return
      const target = currentRef.current
      if (!target) return
      const r = tryInteract(target.object)
      if (r.kind === 'locked') {
        if (r.needsCode) onCodeRequest(target.object.id)
        else useWorld.getState().pushHud(r.message, 2000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, onCodeRequest])

  return null
}

function findSceneObjectId(o: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = o
  while (cur) {
    const id = cur.userData?.sceneObjectId
    if (id) return id as string
    cur = cur.parent
  }
  return null
}

function promptFor(obj: SceneObject): string {
  const b = obj.interact?.behavior
  if (!b) return 'Interact'
  switch (b.type) {
    case 'pickup':
      return `Pick up ${b.label ?? b.itemId}`
    case 'readable':
      return 'Read'
    case 'exit':
      return 'Escape'
    case 'toggleState':
    case 'setState':
      return obj.interact?.lock ? 'Use' : 'Toggle'
  }
}
