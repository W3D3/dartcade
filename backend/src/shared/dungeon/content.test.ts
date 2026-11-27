import { describe, expect, it } from 'vitest'
import { ARTIFACTS } from './content/artifacts.js'
import { CLASSES } from './content/classes.js'
import { ENEMIES } from './content/enemies.js'
import { EVENTS } from './content/events.js'
import { ENCOUNTERS } from './content/rooms.js'
import { SEGMENT_ITEMS } from './content/segmentItems.js'
import type { ContentEntry } from './content/types.js'

const entries: [string, Record<string, ContentEntry>][] = [
  ['artifacts', ARTIFACTS],
  ['segment items', SEGMENT_ITEMS],
  ['classes', CLASSES],
]

describe('content registries', () => {
  it.each(entries)('every one of the %s has a name, a description and a hook or a modifier', (_, table) => {
    for (const entry of Object.values(table)) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
      expect(Object.keys(entry.hooks).length + Object.keys(entry.modifiers ?? {}).length).toBeGreaterThan(0)
    }
  })

  it('no id is used by two kinds of content (the sprite table is keyed by id)', () => {
    const ids = [...Object.keys(ARTIFACTS), ...Object.keys(SEGMENT_ITEMS), ...Object.keys(CLASSES), ...Object.keys(ENEMIES)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every encounter names known enemies, and the boss room only the boss', () => {
    for (const bands of Object.values(ENCOUNTERS))
      for (const band of bands) for (const enc of band.pool) for (const id of enc) expect(ENEMIES).toHaveProperty(id)
    expect(ENCOUNTERS.boss.flatMap(b => b.pool.flat())).toEqual(['dungeonWarden'])
  })

  it('every enemy attacks at some point and every event outcome names known items', () => {
    for (const e of Object.values(ENEMIES)) expect(e.pattern.some(i => i.kind === 'attack')).toBe(true)
    for (const ev of Object.values(EVENTS)) {
      expect(ev.decisions.length).toBeGreaterThanOrEqual(2)
      expect(ev.decisions.length).toBeLessThanOrEqual(4)
      for (const d of ev.decisions) for (const o of d.outcomes) if (o.kind === 'item') expect(SEGMENT_ITEMS).toHaveProperty(o.item)
    }
  })
})
