import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import ProfileModeStats from '../components/progress/ProfileModeStats.svelte'
import { GAME_NAMES } from '$shared/gameNames'

// The Stats tab names a mode in full, as the Play page and History do: never an id or an abbreviation
describe('ProfileModeStats', () => {
  const ids = Object.keys(GAME_NAMES) as (keyof typeof GAME_NAMES)[]
  const blocks = ids.map(mode => ({ mode, games: 2, tiles: [{ id: 'wins', label: 'Games won', value: 1, format: 'int' as const }] }))

  it('headings every mode with its full name, in the order given', () => {
    const out = render(ProfileModeStats, { props: { modes: blocks, self: true } }).body
    const headings = [...out.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(m => m[1])
    expect(headings).toEqual(ids.map(id => GAME_NAMES[id].title))
    for (const banned of ['ATC', 'P121', 'HiLo', '>CRI<', '>CAT<']) expect(out).not.toContain(banned)
  })

  it('renders nothing for no modes', () => {
    expect(render(ProfileModeStats, { props: { modes: [], self: false } }).body).not.toContain('<article')
  })
})
