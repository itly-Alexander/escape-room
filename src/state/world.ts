import { create } from 'zustand'
import type { Level } from '@/schema/level'

export type HudMessage = { id: number; text: string; expiresAt: number }

export type ActiveReadable = { objectId: string; text: string }

type WorldState = {
  level: Level | null
  flags: Record<string, boolean>
  inventory: string[]
  pickedUpObjectIds: Set<string>
  selectedItem: string | null
  won: boolean
  paused: boolean
  hud: HudMessage[]
  activeReadable: ActiveReadable | null
  debugFullbright: boolean

  loadLevel: (level: Level) => void
  setFlag: (id: string, value: boolean) => void
  toggleFlag: (id: string) => void
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

export const useWorld = create<WorldState>((set, get) => ({
  level: null,
  flags: {},
  inventory: [],
  pickedUpObjectIds: new Set<string>(),
  selectedItem: null,
  won: false,
  paused: false,
  hud: [],
  activeReadable: null,
  debugFullbright: false,

  loadLevel: (level) =>
    set({
      level,
      flags: { ...level.initialState },
      inventory: [],
      pickedUpObjectIds: new Set<string>(),
      selectedItem: null,
      won: false,
      paused: false,
      hud: [],
      activeReadable: null,
    }),

  setFlag: (id, value) => set((s) => ({ flags: { ...s.flags, [id]: value } })),
  toggleFlag: (id) => set((s) => ({ flags: { ...s.flags, [id]: !s.flags[id] } })),

  addItem: (itemId) =>
    set((s) => (s.inventory.includes(itemId) ? s : { inventory: [...s.inventory, itemId] })),
  removeItem: (itemId) =>
    set((s) => ({
      inventory: s.inventory.filter((i) => i !== itemId),
      selectedItem: s.selectedItem === itemId ? null : s.selectedItem,
    })),
  selectItem: (itemId) => set({ selectedItem: itemId }),
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
      inventory: [],
      pickedUpObjectIds: new Set<string>(),
      selectedItem: null,
      won: false,
      paused: false,
      hud: [],
      activeReadable: null,
    }),
}))
