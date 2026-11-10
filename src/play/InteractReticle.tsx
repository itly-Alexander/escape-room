import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Level, SceneObject } from '@/schema/level'
import { tryInteract } from '@/engine/interact'
import { sfx } from '@/engine/ambient'
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
  // E (or Space) held down: turns a wheel for as long as you keep at it.
  const holding = useRef(false)

  useFrame((_, rawDt) => {
    crank(currentRef.current, holding.current && enabled && !useWorld.getState().hide, Math.min(rawDt, 0.1))
    // Nothing to aim at while crawling in, hiding or crawling out.
    if (!enabled || useWorld.getState().hide) {
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
      const b = obj.interact?.behavior
      const overturned = b?.type === 'hide' && !!b.group && !!useWorld.getState().flags[`flip-${b.group}`]
      if (obj.interact && !overturned) {
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
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Space') holding.current = false
    }
    const onBlur = () => (holding.current = false)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' && e.code !== 'Space') return
      holding.current = true
      // Holding the key down is one press, not a stream of them.
      if (e.repeat) return
      // While hiding, E crawls back out (and does nothing mid-crawl).
      const w = useWorld.getState()
      if (w.hide) {
        if (w.hide.phase === 'hidden') {
          w.setHidePhase('leaving')
        }
        return
      }
      if (!enabled) return
      const target = currentRef.current
      if (!target) {
        // Nothing in reach: E reads (or puts away) the letter in your hand.
        const held = heldReadable(level)
        if (held) {
          const cur = useWorld.getState().activeReadable
          useWorld.getState().setActiveReadable(cur?.persistent ? null : held)
          sfx.play('read')
        }
        return
      }
      const r = tryInteract(target.object)
      if (r.kind === 'locked') {
        if (r.needsCode) onCodeRequest(target.object.id)
        else useWorld.getState().pushHud(r.message, 2000)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled, onCodeRequest])

  return null
}

/** Turns the wheel in the reticle while E is held, until it's all the way round. */
function crank(target: ReticleTarget | null, turning: boolean, dt: number) {
  const b = target?.object.interact?.behavior
  if (!turning || b?.type !== 'crank') return
  const w = useWorld.getState()
  const cur = w.values[b.valueId] ?? 0
  if (cur >= 1) return
  const next = Math.min(1, cur + dt / b.seconds)
  w.setValue(b.valueId, next)
  if (next >= 1) {
    // Anything that hangs on the wheel (a shutter, say) can wait for this flag.
    w.setFlag(`${b.valueId}-done`, true)
    if (b.done) w.pushHud(b.done, 4000)
    sfx.play('open')
  }
}

/** The text of the selected inventory item, if it's something you can read. */
export function heldReadable(level: Level | null) {
  const w = useWorld.getState()
  if (!level || !w.selectedItem || !w.inventory.includes(w.selectedItem)) return null
  for (const o of level.objects) {
    const b = o.interact?.behavior
    if (b?.type === 'pickup' && b.itemId === w.selectedItem && b.readText) {
      return { objectId: `held:${b.itemId}`, text: b.readText, handwritten: b.handwritten, persistent: true }
    }
  }
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
      return obj.interact?.lock?.requires.kind === 'code' ? 'Enter the code' : 'Escape'
    case 'hide':
      return 'Hide under the table'
    case 'combine':
      return b.prompt ?? 'Use'
    case 'toggleState': {
      if (b.label) {
        const open = obj.pose ? !!useWorld.getState().flags[obj.pose.stateId] : !!useWorld.getState().flags[b.stateId]
        return `${open ? 'Close' : 'Open'} the ${b.label}`
      }
      return obj.interact?.lock ? 'Use' : 'Toggle'
    }
    case 'setState':
      return b.prompt ?? (obj.interact?.lock ? 'Use' : 'Toggle')
    case 'crank':
      return b.prompt ?? 'Hold to turn'
    case 'cycle':
      return b.prompt ?? 'Turn'
  }
}
