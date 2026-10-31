import { parseLevel, type Level } from '@/schema/level'

// Levels are TypeScript modules under /levels. Each file exports a Level as
// its default export (constructed via the leveldsl's defineLevel helper, which
// validates with zod before returning). A level with random parts also exports
// `reroll()`, which builds a fresh copy each time the level is started.
type LevelModule = { default: unknown; reroll?: () => unknown }
const bundled = import.meta.glob('/levels/*.ts', { eager: true }) as Record<string, LevelModule>

export type LevelListing = { id: string; name: string; tags: string[] }

export function listBundledLevels(): LevelListing[] {
  return Object.values(bundled).map((m) => {
    const l = parseLevel(m.default)
    return { id: l.id, name: l.name, tags: l.tags }
  })
}

export function loadBundledLevel(id: string): Level | null {
  for (const m of Object.values(bundled)) {
    const l = parseLevel(m.default)
    if (l.id === id) return m.reroll ? parseLevel(m.reroll()) : l
  }
  return null
}
