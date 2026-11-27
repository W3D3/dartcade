// "Copy as a test case": the setup and the log written out as a Vitest test for the engine, with
// today's result as the expectation. Paste it next to resolve.test.ts and tidy the numbers into meaning.
import { hitLabel } from './script.js'
import { replay, type Action } from './session.js'
import type { Setup } from './setup.js'

const lit = (v: unknown, indent?: number): string =>
  JSON.stringify(v, null, indent)
    .replace(/"([a-zA-Z_]\w*)":/g, '$1:')
    .replace(/"/g, "'")

export function testCase(setup: Setup, log: readonly Action[], title = 'playground case'): string {
  const lines: string[] = []
  log.forEach((a, i) => {
    // The seat and the darts come from the replay itself, so a seat the engine moved on its own is right
    const before = replay(setup, log.slice(0, i))
    const after = replay(setup, log.slice(0, i + 1))
    if (a.t === 'end' && before.visit.length) {
      lines.push(
        `  // hero ${before.seat + 1} throws ${before.visit.map(hitLabel).join(' ')}`,
        `  ;({ heroes, enemies, gold } = resolveVisit({ seat: ${before.seat}, visit: ${lit(before.visit)}, heroes, enemies, items, gold }))`,
        `  expect(enemies.map(e => e.hp)).toEqual(${lit(after.enemies.map(e => e.hp))})`,
      )
    } else if (a.t === 'enemyTurn') {
      lines.push(
        `  ;({ heroes, enemies } = enemyTurn(heroes, enemies, ${before.round}, '${setup.cfg.difficulty}', DUNGEON_RULES))`,
        `  expect(heroes.map(h => [h.hp, h.block])).toEqual(${lit(after.heroes.map(h => [h.hp, h.block]))})`,
      )
    }
  })
  const start = replay(setup, [])
  const end = replay(setup, log)
  return `import { expect, it } from 'vitest'
import { enemyTurn } from './enemyTurn.js'
import { resolveVisit } from './resolve.js'
import { DUNGEON_RULES } from './rules.js'
import type { Enemy, Hero, PlacedItem } from './state.js'

it('${title.replace(/'/g, '')}', () => {
  let heroes: Hero[] = ${lit(start.heroes, 2)}
  let enemies: Enemy[] = ${lit(start.enemies, 2)}
  const items: PlacedItem[] = ${lit(start.items, 2)}
  let gold = ${setup.gold}
${lines.join('\n')}
  expect(heroes.map(h => h.hp)).toEqual(${lit(end.heroes.map(h => h.hp))})
  expect(gold).toBe(${end.gold})
})
`
}
