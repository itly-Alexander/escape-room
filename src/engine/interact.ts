import type { Level, SceneObject } from '@/schema/level'
import { useWorld } from '@/state/world'
import { sfx } from '@/engine/ambient'

export type InteractResult =
  | { kind: 'none' }
  | { kind: 'locked'; message: string; needsCode?: boolean; objectId: string }
  | { kind: 'ok' }

/**
 * Runs the full interact pipeline for an object: optional lock gate, then behavior.
 * Returns an InteractResult the HUD can respond to (e.g. open a code modal, show "locked" toast).
 */
export function tryInteract(object: SceneObject, enteredCode?: string): InteractResult {
  if (!object.interact) return { kind: 'none' }
  const w = useWorld.getState()
  const lock = object.interact.lock

  if (lock) {
    if (lock.requires.kind === 'item') {
      const needed = lock.requires.itemId
      const hasIt = w.inventory.includes(needed)
      const holdingIt = w.selectedItem === needed
      const mustHold = lock.requires.held !== false
      if (mustHold ? !holdingIt : !hasIt) {
        sfx.play('locked')
        const label = labelForItem(w.level, needed) ?? needed
        const message = hasIt && mustHold
          ? `You need to hold the ${label} first.`
          : lock.lockedMessage ?? 'Locked. Need an item.'
        return { kind: 'locked', message, objectId: object.id }
      }
      if (lock.consumeItem) w.removeItem(needed)
    } else {
      if (enteredCode === undefined) {
        return {
          kind: 'locked',
          message: lock.lockedMessage ?? 'Requires a code.',
          needsCode: true,
          objectId: object.id,
        }
      }
      if (enteredCode !== lock.requires.code) {
        sfx.play('locked')
        return {
          kind: 'locked',
          message: 'Wrong code.',
          needsCode: true,
          objectId: object.id,
        }
      }
    }
  }

  runBehavior(object)
  return { kind: 'ok' }
}

function labelForItem(level: Level | null, itemId: string): string | undefined {
  if (!level) return undefined
  for (const obj of level.objects) {
    const b = obj.interact?.behavior
    if (b?.type === 'pickup' && b.itemId === itemId) return b.label
  }
  return undefined
}

function runBehavior(object: SceneObject) {
  if (!object.interact) return
  const w = useWorld.getState()
  const b = object.interact.behavior
  switch (b.type) {
    case 'pickup':
      w.addItem(b.itemId)
      w.markPickedUp(object.id)
      w.pushHud(`Picked up ${b.label ?? b.itemId}`)
      sfx.play('pickup')
      if (b.readText) w.setActiveReadable({ objectId: `held:${b.itemId}`, text: b.readText, handwritten: b.handwritten, persistent: true })
      return
    case 'toggleState':
      w.toggleFlag(b.stateId)
      // Labelled toggles are doors: a hinge squeak, not a chest creak.
      sfx.play(b.label ? 'door' : 'open')
      return
    case 'setState':
      w.setFlag(b.stateId, b.value)
      sfx.play(b.sound ?? 'open')
      return
    case 'readable':
      w.setActiveReadable({ objectId: object.id, text: b.text, handwritten: b.handwritten })
      sfx.play('read')
      return
    case 'combine': {
      if (w.flags[b.stateId]) {
        w.pushHud(b.already ?? 'Nothing more to do here.', 3500)
        return
      }
      const chosen = b.groups.map((g) => g.itemIds.find((id) => w.inventory.includes(id)))
      const missing = b.groups.filter((_, i) => !chosen[i]).map((g) => g.label)
      if (missing.length) {
        w.pushHud(`${b.missing ?? 'Something is still missing:'} ${missing.join(', ')}.`, 5000)
        sfx.play('locked')
        return
      }
      for (const id of chosen) if (id) w.removeItem(id)
      w.setFlag(b.stateId, true)
      w.pushHud(b.done, 8000)
      sfx.play('win')
      return
    }
    case 'hide':
      if (w.hide || (b.group && w.flags[`flip-${b.group}`])) return
      w.startHide(b)
      return
    case 'exit':
      if (w.level?.exitId === object.id) {
        w.setWon(true)
        w.pushHud('You escaped!', 6000)
        sfx.play('win')
      }
      return
  }
}
