import { create } from 'zustand'
import type { Level } from '@/schema/level'
import { sfx } from '@/engine/ambient'

export type HudMessage = { id: number; text: string; expiresAt: number }

export type ActiveReadable = {
  objectId: string
  text: string
  handwritten?: boolean
  // Stays up until closed (a letter you're holding), rather than fading when you look away.
  persistent?: boolean
}

type P3 = [number, number, number]
export type HideSpot = { edge: P3; deep: P3; spot: P3; exit: P3; outYaw: number; group?: string; approach?: P3 }
/** The player crawling into / sitting in / crawling out of a hiding place. */
export type HideState = { phase: 'entering' | 'hidden' | 'leaving'; spot: HideSpot }

type WorldState = {
  level: Level | null
  flags: Record<string, boolean>
  /** Numbers the level keeps: how far a wheel's been turned, which colour a dial shows. */
  values: Record<string, number>
  inventory: string[]
  pickedUpObjectIds: Set<string>
  selectedItem: string | null
  won: boolean
  paused: boolean
  hud: HudMessage[]
  activeReadable: ActiveReadable | null
  hide: HideState | null
  debugFullbright: boolean
  /** The monster has got the player: game over. */
  caught: boolean

  setCaught: (caught: boolean) => void
  startHide: (spot: HideSpot) => void
  setHidePhase: (phase: HideState['phase']) => void
  endHide: () => void
  loadLevel: (level: Level) => void
  setFlag: (id: string, value: boolean) => void
  toggleFlag: (id: string) => void
  setValue: (id: string, value: number) => void
  addItem: (itemId: string) => void
  removeItem: (itemId: string) => void
  markPickedUp: (objectId: string) => void
  selectItem: (itemId: string | null) => void
  pushHud: (text: string, durationMs?: number) => void
  pruneHud: () => void
  setWon: (won: boolean) => void
  setPaused: (paused: boolean) => void
  setActiveReadable: (r: ActiveReadable | null) => void
  toggleDebugFullbright: () => void
  reset: () => void
}

let hudSeq = 1

/** Level rules: once all of a rule's flags are set, its own flag is set too. */
function applyRules() {
  const { level } = useWorld.getState()
  if (!level) return
  for (const rule of level.rules) {
    const { flags } = useWorld.getState()
    if (flags[rule.set] || !rule.whenAll.every((f) => flags[f])) continue
    useWorld.setState({ flags: { ...flags, [rule.set]: true } })
    if (rule.message) useWorld.getState().pushHud(rule.message, 9000)
    sfx.play('open')
  }
}

export const useWorld = create<WorldState>((set, get) => ({
  level: null,
  flags: {},
  values: {},
  inventory: [],
  pickedUpObjectIds: new Set<string>(),
  selectedItem: null,
  won: false,
  paused: false,
  hud: [],
  activeReadable: null,
  hide: null,
  debugFullbright: false,
  caught: false,

  setCaught: (caught) => set({ caught }),
  startHide: (spot) => set((s) => (s.hide ? s : { hide: { phase: 'entering', spot } })),
  setHidePhase: (phase) => set((s) => (s.hide ? { hide: { ...s.hide, phase } } : s)),
  endHide: () => set({ hide: null }),

  loadLevel: (level) =>
    set({
      level,
      flags: { ...level.initialState },
      values: {},
      inventory: [],
      pickedUpObjectIds: new Set<string>(),
      selectedItem: null,
      won: false,
      paused: false,
      hud: [],
      activeReadable: null,
      hide: null,
      caught: false,
    }),

  setFlag: (id, value) => {
    set((s) => ({ flags: { ...s.flags, [id]: value } }))
    applyRules()
  },
  toggleFlag: (id) => {
    set((s) => ({ flags: { ...s.flags, [id]: !s.flags[id] } }))
    applyRules()
  },
  setValue: (id, value) => set((s) => ({ values: { ...s.values, [id]: value } })),

  addItem: (itemId) =>
    set((s) => (s.inventory.includes(itemId) ? s : { inventory: [...s.inventory, itemId] })),
  removeItem: (itemId) =>
    set((s) => ({
      inventory: s.inventory.filter((i) => i !== itemId),
      selectedItem: s.selectedItem === itemId ? null : s.selectedItem,
    })),
  // Putting a letter away closes it.
  selectItem: (itemId) => set((s) => ({ selectedItem: itemId, activeReadable: s.activeReadable?.persistent ? null : s.activeReadable })),
  markPickedUp: (objectId) =>
    set((s) => {
      if (s.pickedUpObjectIds.has(objectId)) return s
      const next = new Set(s.pickedUpObjectIds)
      next.add(objectId)
      return { pickedUpObjectIds: next }
    }),

  pushHud: (text, durationMs = 2200) => {
    const msg: HudMessage = { id: hudSeq++, text, expiresAt: Date.now() + durationMs }
    set((s) => ({ hud: [...s.hud, msg] }))
  },
  pruneHud: () => {
    const now = Date.now()
    const next = get().hud.filter((m) => m.expiresAt > now)
    if (next.length !== get().hud.length) set({ hud: next })
  },

  setWon: (won) => set({ won }),
  setPaused: (paused) => set({ paused }),
  setActiveReadable: (r) => set({ activeReadable: r }),
  toggleDebugFullbright: () => set((s) => ({ debugFullbright: !s.debugFullbright })),

  reset: () =>
    set({
      flags: {},
      values: {},
      inventory: [],
      pickedUpObjectIds: new Set<string>(),
      selectedItem: null,
      won: false,
      paused: false,
      hud: [],
      activeReadable: null,
      hide: null,
      caught: false,
    }),
}))
