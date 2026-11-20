import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import GameAchievements from '../components/achievements/GameAchievements.svelte'
import WinScreen from '../components/WinScreen.svelte'
import { unlockViews } from '../achievements/toasts'
import type { WinView } from '../winScreen.js'

const unlocks = unlockViews({
  type: 'achievement.unlocked',
  sessionId: 'g1',
  unlocked: [
    { id: 'x01.180', from: 2, tier: 3, count: 10, xp: 300 },
    { id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 },
  ],
  levelBefore: 3,
  levelAfter: 4,
})

describe('the achievements screen after a game', () => {
  it('shows each achievement and moves the win screen’s buttons there', () => {
    const { body } = render(GameAchievements, {
      props: {
        unlocks,
        primary: { label: 'Rematch', icon: 'rematch', onclick: () => {} },
        secondary: { label: 'Back to lobby', onclick: () => {} },
      },
    })
    for (const text of [
      '2 achievements',
      'Achievement Tier Up · Gold',
      'New Achievement',
      'Silver',
      'Next: tier 4 · Platinum',
      'Rematch',
      'Back to lobby',
    ])
      expect(body).toContain(text)
  })

  it('the win screen leads to it with Next as its only main button', () => {
    const view: WinView = {
      mode: 'atc',
      layout: 'duel',
      competitors: [{ name: 'Ann', face: null, members: [], seats: [0], placement: 1, score: 21, sub: '', cells: [] }],
      kicker: 'Game over',
      scoreLabel: 'Targets',
      note: '',
      checkout: null,
      legs: [],
      stats: [],
      columns: [],
      highlights: [],
    }
    const { body } = render(WinScreen, {
      props: {
        view,
        title: 'ATC',
        meta: '',
        lobbyName: null,
        board: null,
        saved: true,
        primary: { label: 'Next', icon: 'next', onclick: () => {} },
      },
    })
    const footer = body.slice(body.indexOf('<footer'))
    expect(footer).toContain('Next')
    expect(footer).toContain('bg-accent')
    expect(footer).not.toContain('Rematch')
  })
})
