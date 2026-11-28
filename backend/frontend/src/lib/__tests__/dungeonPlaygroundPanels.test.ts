import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import { ARTIFACTS } from '$shared/dungeon/content/artifacts.js'
import ResultPanel from '../components/dungeon/playground/ResultPanel.svelte'
import SetupPanel from '../components/dungeon/playground/SetupPanel.svelte'
import ThrowPanel from '../components/dungeon/playground/ThrowPanel.svelte'
import { parseScript } from '../dungeon/playground/script'
import { createPlayground } from '../dungeon/playground/store.svelte'

describe('playground panels', () => {
  it('setup lists the hero, the enemy, and every artifact with its exact text', () => {
    const pg = createPlayground()
    const { body } = render(SetupPanel, { props: { pg } })
    expect(body).toContain('Hero 1')
    expect(body).toContain('Skeleton')
    for (const a of Object.values(ARTIFACTS)) {
      expect(body).toContain(a.name)
      expect(body).toContain(a.description)
    }
  })

  it('throw shows the board, the heroes and the script box', () => {
    const { body } = render(ThrowPanel, { props: { pg: createPlayground() } })
    expect(body).toContain('Throw script')
    expect(body).toContain('Undo dart')
    expect(body).toContain('Random throw')
  })

  it('result shows the trace of a resolved visit with both artifacts', () => {
    const pg = createPlayground()
    for (const hit of parseScript('t20 t20 t20').hits) pg.do({ t: 'dart', hit })
    pg.do({ t: 'end' })
    const { body } = render(ResultPanel, { props: { pg } })
    expect(body).toContain('Pin Cushion')
    expect(body).toContain('Piercing Sword')
    expect(body).toContain('What the visit changed')
    expect(body).toContain('Run enemy turn')
  })

  it('editing the setup re-runs the log against it', () => {
    const pg = createPlayground()
    for (const hit of parseScript('t20 t20 t20').hits) pg.do({ t: 'dart', hit })
    pg.do({ t: 'end' })
    expect(pg.state.enemies[0].hp).toBe(200)
    pg.setup.heroes[0].artifacts = []
    expect(pg.state.enemies[0].hp).toBeGreaterThan(200)
  })

  it('a no-op action is not logged', () => {
    const pg = createPlayground()
    pg.do({ t: 'undo' })
    pg.do({ t: 'end' })
    expect(pg.log).toEqual([])
  })
})

describe('repeated script errors', () => {
  it('render without a duplicate-key crash', () => {
    const pg = createPlayground()
    pg.script = 'foo foo t21, t21'
    expect(() => render(ThrowPanel, { props: { pg } })).not.toThrow()
  })
})
