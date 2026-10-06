// NextGameCard and MemberPanel each derive `hasBot` from the lobby's own `people` (the full
// Lobby type has no `hasBot` field — only LobbySummary, used by /ws/me, does) and must forward
// it to NextGameSettingsPanel so the Bot speed field in GameSettings can show. These mock the
// panel to capture the prop it's actually given, since the panel's own `{#if open}` gate (closed
// by default) would otherwise hide any difference from the rendered HTML.
import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

// Same bits-ui SSR crash worked around in gameSettingsBotSpeed.test.ts: a transitive import of
// bits-ui's whole barrel breaks this toolchain's SSR CSS preprocessing outside the main pipeline.
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

vi.mock('../components/lobby/NextGameSettingsPanel.svelte', () => ({
  default: (renderer: { push: (content: string) => void }, props: { hasBot?: boolean }) => {
    renderer.push(`<div data-testid="panel" data-has-bot="${String(props.hasBot)}"></div>`)
  },
}))

import NextGameCard from '../components/lobby/NextGameCard.svelte'
import MemberPanel from '../components/lobby/MemberPanel.svelte'

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
  ...over,
})
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', ready: true, presence: 'online' })
const bot = person({ id: 'b', name: 'Bot 1', addedByUserId: 'chris', bot: { level: 5 } })

const baseLobby: Omit<Lobby, 'people'> = {
  id: 'l1',
  name: 'Friday darts',
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'friends',
  nextGame: { gameId: 'x01', config: {} },
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  invites: [],
  activity: [],
  solo: false,
  nextHostName: null,
}

const noop = () => Promise.resolve(true)

function panelHasBot(html: string): string | null {
  const m = html.match(/data-has-bot="([^"]+)"/)
  return m ? m[1] : null
}

describe('NextGameCard: hasBot derived from lobby.people and forwarded', () => {
  it('is true when a person is a bot', () => {
    const lobby: Lobby = { ...baseLobby, people: [chris, bot] }
    const out = render(NextGameCard, {
      props: { lobby, onupdate: noop, onplays: noop, onteammove: noop, onteamplace: noop, onteamshuffle: noop, onstart: () => {} },
    }).body
    expect(panelHasBot(out)).toBe('true')
  })

  it('is false when nobody is a bot', () => {
    const lobby: Lobby = { ...baseLobby, people: [chris] }
    const out = render(NextGameCard, {
      props: { lobby, onupdate: noop, onplays: noop, onteammove: noop, onteamplace: noop, onteamshuffle: noop, onstart: () => {} },
    }).body
    expect(panelHasBot(out)).toBe('false')
  })
})

describe('MemberPanel: hasBot derived from lobby.people and forwarded', () => {
  it('is true when a person is a bot', () => {
    const lobby: Lobby = { ...baseLobby, people: [chris, bot] }
    const out = render(MemberPanel, { props: { lobby, me: chris, onupdate: noop } }).body
    expect(panelHasBot(out)).toBe('true')
  })

  it('is false when nobody is a bot', () => {
    const lobby: Lobby = { ...baseLobby, people: [chris] }
    const out = render(MemberPanel, { props: { lobby, me: chris, onupdate: noop } }).body
    expect(panelHasBot(out)).toBe('false')
  })
})
