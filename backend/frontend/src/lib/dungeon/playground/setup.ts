// A situation to play with: the party, the enemies, the board's items, the round and the seed. It is
// plain JSON (presets, export and import go through `SetupSchema`) and maps to the engine's own types.
import { z } from 'zod'
import { DEFAULT_CONFIG, DIFFICULTIES, DUNGEON_RULES, FLOOR_COUNTS, enemyHp, type DungeonConfig } from '$shared/dungeon/rules.js'
import type { Enemy, Hero, PlacedItem } from '$shared/dungeon/state.js'
import { isArtifactId } from '$shared/dungeon/content/artifacts.js'
import { isClassId } from '$shared/dungeon/content/classes.js'
import { isEnemyId } from '$shared/dungeon/content/enemies.js'
import { isSegmentItemId } from '$shared/dungeon/content/segmentItems.js'
import { liveCatalogue, knows, type Catalogue } from './catalogue.js'

const isFloors = (n: number): n is DungeonConfig['floors'] => FLOOR_COUNTS.some(f => f === n)
const int = (min: number, max = 1_000_000) => z.number().int().min(min).max(max)

export const HeroSetupSchema = z.object({
  classId: z.string().nullable(),
  healSegment: int(1, 20).nullable(),
  hp: int(0),
  maxHp: int(1),
  block: int(0),
  artifacts: z.array(z.string()).max(30),
})

export const EnemySetupSchema = z.object({
  kind: z.string(),
  hp: int(0),
  maxHp: int(1),
  burn: int(0),
  chilled: z.boolean(),
})

export const SetupSchema = z.object({
  v: z.literal(1),
  seed: int(0, 0xffffffff),
  cfg: z.object({
    difficulty: z.enum(DIFFICULTIES),
    floors: z.number().refine(isFloors),
  }),
  room: z.enum(['fight', 'elite', 'boss']),
  round: int(1, 999),
  gold: int(0),
  heroes: z.array(HeroSetupSchema).min(DUNGEON_RULES.minParty).max(DUNGEON_RULES.maxParty),
  enemies: z.array(EnemySetupSchema).max(3),
  items: z.array(z.object({ number: z.number().int().min(1).max(25), item: z.string() })).max(40),
})

export type Setup = z.infer<typeof SetupSchema>
export type HeroSetup = z.infer<typeof HeroSetupSchema>
export type EnemySetup = z.infer<typeof EnemySetupSchema>

export const newHero = (): HeroSetup => ({
  classId: null,
  healSegment: null,
  hp: DUNGEON_RULES.startHp,
  maxHp: DUNGEON_RULES.startHp,
  block: 0,
  artifacts: [],
})

/** A fresh enemy with the HP the run would give it for this party and difficulty. */
export function newEnemy(kind: string, cat: Catalogue, players: number, cfg: DungeonConfig): EnemySetup {
  const entry = cat.enemies[kind]
  const hp = entry ? enemyHp(entry.hp, players, cfg.difficulty) : 1
  return { kind, hp, maxHp: hp, burn: 0, chilled: false }
}

export const emptySetup = (seed = 1): Setup => ({
  v: 1,
  seed,
  cfg: { ...DEFAULT_CONFIG },
  room: 'fight',
  round: 1,
  gold: 0,
  heroes: [newHero()],
  enemies: [],
  items: [],
})

/** Parses JSON from outside (a file, local storage): the shape by zod, then every id against the registries. */
export function parseSetup(json: unknown, cat: Catalogue = liveCatalogue()): { setup: Setup } | { error: string } {
  const r = SetupSchema.safeParse(json)
  if (!r.success) return { error: r.error.issues.map(i => `${i.path.join('.') || 'setup'}: ${i.message}`).join('; ') }
  const s = r.data
  const unknown = [
    ...s.heroes.flatMap(h => [
      ...(h.classId && !knows(cat.classes, h.classId) ? [`class ${h.classId}`] : []),
      ...h.artifacts.filter(a => !knows(cat.artifacts, a)).map(a => `artifact ${a}`),
    ]),
    ...s.enemies.filter(e => !knows(cat.enemies, e.kind)).map(e => `enemy ${e.kind}`),
    ...s.items.filter(i => !knows(cat.items, i.item)).map(i => `item ${i.item}`),
  ]
  return unknown.length ? { error: `unknown ${unknown.join(', ')}` } : { setup: s }
}

// An id the registries lack (parseSetup refuses it, `checks` reports it) is left out of the engine's state
export const heroesOf = (s: Setup): Hero[] =>
  s.heroes.map((h, seat) => ({
    ...h,
    seat,
    classId: h.classId && isClassId(h.classId) ? h.classId : null,
    artifacts: h.artifacts.filter(isArtifactId),
  }))
export const enemiesOf = (s: Setup): Enemy[] =>
  s.enemies.flatMap((e, i) => (isEnemyId(e.kind) ? [{ ...e, uid: `e${i}`, kind: e.kind }] : []))
export const itemsOf = (s: Setup): PlacedItem[] =>
  s.items.flatMap(i => (isSegmentItemId(i.item) ? [{ number: i.number, item: i.item }] : []))

export type Check = { level: 'error' | 'warn' | 'info'; message: string }

/** What breaks an engine invariant (or surprises): shown beside the setup, never blocks a throw. */
export function checks(s: Setup, cat: Catalogue = liveCatalogue()): Check[] {
  const out: Check[] = []
  const bad = (message: string) => out.push({ level: 'error', message })
  const warn = (message: string) => out.push({ level: 'warn', message })
  const name = (i: number) => `Hero ${i + 1}`

  const classes = s.heroes.flatMap((h, i) => (h.classId ? [{ id: h.classId, i }] : []))
  for (const c of classes) if (!knows(cat.classes, c.id)) bad(`${name(c.i)}: unknown class ${c.id}`)
  const seen = new Map<string, number>()
  for (const c of classes) {
    const first = seen.get(c.id)
    if (first !== undefined) bad(`${name(c.i)} and ${name(first)} are both ${cat.classes[c.id]?.name ?? c.id}: no two heroes share a class`)
    else seen.set(c.id, c.i)
  }

  s.heroes.forEach((h, i) => {
    if (h.classId === 'healer' && h.healSegment === null) warn(`${name(i)}: a Healer needs a heal number`)
    if (h.classId !== 'healer' && h.healSegment !== null) warn(`${name(i)}: only a Healer has a heal number`)
    if (h.hp > h.maxHp) bad(`${name(i)}: HP ${h.hp} is above max HP ${h.maxHp}`)
    if (h.hp === 0) warn(`${name(i)} is down: a run skips downed heroes`)
    const dup = h.artifacts.filter((a, k) => h.artifacts.indexOf(a) !== k)
    if (dup.length)
      bad(`${name(i)} owns ${[...new Set(dup)].map(a => cat.artifacts[a]?.name ?? a).join(', ')} twice: an artifact is owned once per hero`)
    for (const a of h.artifacts) if (!knows(cat.artifacts, a)) bad(`${name(i)}: unknown artifact ${a}`)
    const cls = h.classId ? cat.classes[h.classId] : undefined
    if (cls && !h.artifacts.includes(cls.startingArtifact))
      out.push({
        level: 'info',
        message: `${name(i)}: a ${cls.name} starts a run with ${cat.artifacts[cls.startingArtifact]?.name ?? cls.startingArtifact}`,
      })
  })

  const perNumber = new Map<number, number>()
  for (const it of s.items) perNumber.set(it.number, (perNumber.get(it.number) ?? 0) + 1)
  for (const [n, count] of perNumber)
    if (count > DUNGEON_RULES.slotsPerNumber)
      bad(`${count} items on ${n === 25 ? 'the bull' : n}: a number holds ${DUNGEON_RULES.slotsPerNumber}`)
  for (const it of s.items) if (!knows(cat.items, it.item)) bad(`unknown segment item ${it.item}`)

  s.enemies.forEach((e, i) => {
    if (!knows(cat.enemies, e.kind)) bad(`Enemy ${i + 1}: unknown enemy ${e.kind}`)
    if (e.hp > e.maxHp) bad(`Enemy ${i + 1}: HP ${e.hp} is above max HP ${e.maxHp}`)
  })
  if (!s.enemies.some(e => e.hp > 0)) warn('No living enemy: darts hit nothing')
  return out
}
