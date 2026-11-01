import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import WinScreen from '../components/WinScreen.svelte'
import type { WinView } from '../winScreen.js'

const view: WinView = {
  mode: 'atc',
  layout: 'duel',
  competitors: [
    { name: 'Ann', face: null, members: [], seats: [0], placement: 1, score: 21, sub: '', cells: [] },
    { name: 'Bob', face: null, members: [], seats: [1], placement: 2, score: 9, sub: '', cells: [] },
  ],
  kicker: 'Game over',
  scoreLabel: 'Targets',
  note: '',
  checkout: null,
  legs: [],
  stats: [],
  columns: [],
  highlights: [],
}
const base = { view, title: 'ATC', meta: '', lobbyName: null, board: null, saved: true }

describe('WinScreen buttons', () => {
  it('the match screen’s footer has History, the secondary and the primary button', () => {
    const { body } = render(WinScreen, {
      props: {
        ...base,
        primary: { label: 'Rematch', rematch: true, onclick: () => {} },
        secondary: { label: 'Back to lobby', onclick: () => {} },
        onhistory: () => {},
      },
    })
    expect(body).toContain('<footer')
    for (const label of ['History', 'Back to lobby', 'Rematch']) expect(body).toContain(label)
  })
  it('without buttons (the big screen) there is no footer', () => {
    expect(render(WinScreen, { props: base }).body).not.toContain('<footer')
  })
})

describe('WinScreen bots', () => {
  const botFace = { avatar: { kind: 'none' as const }, userId: null, bot: { level: 4 } }
  for (const layout of ['duel', 'party'] as const) {
    it(`draws a bot's robot glyph, not an initial, in a ${layout}`, () => {
      const bot: WinView = { ...view, layout, competitors: [{ ...view.competitors[0], name: 'Zed', face: botFace }, view.competitors[1]] }
      const { body } = render(WinScreen, { props: { ...base, view: bot } })
      expect(body).toContain('lucide-bot')
    })
  }
})
