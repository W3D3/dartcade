import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import BoardLabel from '../components/lobby/BoardLabel.svelte'
import { averageForLevel } from '$shared/botLevels.js'
import type { LobbyPerson } from '../api/lobby-ws'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p',
  userId: null,
  addedByUserId: 'chris',
  name: 'X',
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays: true,
  ready: false,
  team: null,
  presence: null,
  bot: null,
  avatar: { kind: 'none' },
  ...over,
})

describe('BoardLabel', () => {
  it('shows a guest entering by hand as Manual entry', () => {
    const out = render(BoardLabel, { props: { person: person({}) } }).body
    expect(out).toContain('Manual entry')
  })

  it("shows a bot's calibrated average instead of Manual entry, even though it also has no board (X01 only)", () => {
    const out = render(BoardLabel, { props: { person: person({ bot: { level: 6 } }), gameId: 'x01' } }).body
    expect(out).toContain(`${averageForLevel(6)} avg`)
    expect(out).not.toContain('Manual entry')
  })

  it("shows a bot's level, not an average, outside X01", () => {
    const out = render(BoardLabel, { props: { person: person({ bot: { level: 6 } }), gameId: 'cricket' } }).body
    expect(out).toContain('Level 6')
    expect(out).not.toContain('avg')
  })
})
