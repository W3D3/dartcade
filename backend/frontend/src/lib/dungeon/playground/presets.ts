// Built-in scenarios, and the presets an admin keeps in this browser (local storage) or moves as JSON files.
import { parseSetup, emptySetup, type Setup } from './setup.js'
import { liveCatalogue, type Catalogue } from './catalogue.js'
import { z } from 'zod'

export type Scenario = { name: string; note: string; setup: Setup; script: string }

const hero = (classId: string | null, artifacts: string[], extra: Partial<Setup['heroes'][number]> = {}) => ({
  classId,
  healSegment: null,
  hp: 80,
  maxHp: 80,
  block: 0,
  artifacts,
  ...extra,
})
const enemy = (kind: string, hp: number, extra: Partial<Setup['enemies'][number]> = {}) => ({
  kind,
  hp,
  maxHp: hp,
  burn: 0,
  chilled: false,
  ...extra,
})
const base = (patch: Partial<Setup>): Setup => ({ ...emptySetup(7), ...patch })

export const SCENARIOS: Scenario[] = [
  {
    name: 'Pin Cushion + Piercing Sword',
    note: 'Three treble 20s: Pin Cushion adds to darts 2 and 3, Piercing Sword doubles all three.',
    setup: base({ heroes: [hero('brawler', ['pinCushion', 'piercingSword'])], enemies: [enemy('skeleton', 600)] }),
    script: 't20 t20 t20',
  },
  {
    name: 'Tinderbox burn stacking',
    note: 'Trebles apply Burn; run the enemy turn to watch it tick, then throw again to stack it.',
    setup: base({ heroes: [hero('archer', ['tinderbox'])], enemies: [enemy('armoredKnight', 2000)] }),
    script: 't20 t19 t18',
  },
  {
    name: 'Chilled enemy attack',
    note: 'A chilled enemy hits for less. Run the enemy turn and read the damage. (There is no shatter in the engine yet.)',
    setup: base({ heroes: [hero('guardian', ['spikedBuckler'], { block: 5 })], enemies: [enemy('skeleton', 90, { chilled: true })] }),
    script: 'd16 d16 d16',
  },
  {
    name: 'Bucklers and block',
    note: 'Doubles give block (Twin Buckler); Spiked Buckler turns that block into extra damage after the visit.',
    setup: base({
      heroes: [hero('healer', ['twinBuckler', 'spikedBuckler'], { healSegment: 20, hp: 50 })],
      enemies: [enemy('ghost', 300)],
    }),
    script: 'd16 d20 s20',
  },
  {
    name: 'Mage chain on two enemies',
    note: 'A treble also hits the next enemy for half. Whetstone Rune on 20 adds to the first hit.',
    setup: base({
      heroes: [hero('mage', ['piercingSword'])],
      enemies: [enemy('slime', 200), enemy('skeleton', 200)],
      items: [{ number: 20, item: 'whetstoneRune' }],
    }),
    script: 't20 t20 s5',
  },
]

const STORE_KEY = 'dartcade.dungeonPlayground.presets'

export const PresetFileSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(60),
  setup: z.unknown(),
  script: z.string().max(500).optional(),
})

export type Preset = { name: string; setup: Setup }

/** The presets kept in this browser; an entry that no longer parses (content was removed) is dropped. */
export function loadPresets(cat: Catalogue = liveCatalogue()): Preset[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((p: { name?: unknown; setup?: unknown }) => {
      const r = parseSetup(p.setup, cat)
      return typeof p.name === 'string' && 'setup' in r ? [{ name: p.name, setup: r.setup }] : []
    })
  } catch {
    return []
  }
}

export function savePresets(presets: Preset[]): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

export const exportPreset = (name: string, setup: Setup): string => JSON.stringify({ v: 1, name, setup }, null, 2)

/** A preset file's text: the envelope by zod, then the setup like any other. */
export function importPreset(text: string, cat: Catalogue = liveCatalogue()): { preset: Preset } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { error: 'not JSON' }
  }
  const file = PresetFileSchema.safeParse(json)
  if (!file.success) return { error: file.error.issues.map(i => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ') }
  const r = parseSetup(file.data.setup, cat)
  return 'error' in r ? r : { preset: { name: file.data.name, setup: r.setup } }
}
