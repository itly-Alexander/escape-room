import { parseLevel, type Level } from '@/schema/level'

// Levels are TypeScript modules under /levels. Each file exports a Level as
// its default export (constructed via the leveldsl's defineLevel helper, which
// validates with zod before returning).
const bundled = import.meta.glob('/levels/*.ts', { eager: true, import: 'default' }) as Record<string, unknown>

export type LevelListing = { id: string; name: string }

export function listBundledLevels(): LevelListing[] {
  return Object.values(bundled).map((raw) => {
    const l = parseLevel(raw)
    return { id: l.id, name: l.name }
  })
}

export function loadBundledLevel(id: string): Level | null {
  for (const raw of Object.values(bundled)) {
    const l = parseLevel(raw)
    if (l.id === id) return l
  }
  return null
}
