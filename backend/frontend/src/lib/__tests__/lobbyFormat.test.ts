import { describe, it, expect } from 'vitest'
import {
  accessHint,
  activityLine,
  feedTime,
  formatCode,
  gameName,
  indicatorView,
  inviteTime,
  joinLink,
  nextGameSummary,
  personLine,
  type Part,
} from '../lobby/format.js'
import type { LobbyActivity, LobbyPerson } from '../api/lobby-ws'

const text = (parts: Part[]) => parts.map(p => p.text).join('')
const bold = (parts: Part[]) => parts.filter(p => p.bold).map(p => p.text)
const act = (over: Partial<LobbyActivity>): LobbyActivity => ({
  id: '1',
  at: '2026-10-02T19:40:00.000Z',
  kind: 'joined',
  actorUserId: 'lena',
  actorName: 'Lena',
  data: { name: 'Lena' },
  ...over,
})

describe('lobby text', () => {
  it('formats codes and links', () => {
    expect(formatCode('K7Q4MD')).toBe('K7Q4-MD')
    expect(formatCode('ABC')).toBe('ABC')
    expect(joinLink('http://glados:5173', 'K7Q4MD')).toBe('http://glados:5173/#/join/K7Q4MD')
  })

  it('names game modes, and passes unknown ones through', () => {
    expect(gameName('x01')).toBe('X01')
    expect(gameName('atc')).toBe('Around the Clock')
    expect(gameName('cricket')).toBe('cricket')
  })

  it('sums up the next game', () => {
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 2 } })).toBe(
      '501 · Double out · First to 2 legs',
    )
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 301, outMode: 'straight', firstTo: 1 } })).toBe(
      '301 · Straight out · First to 1 leg',
    )
    expect(nextGameSummary({ gameId: 'atc', config: { order: 'random', finishOn: 'bull' } })).toBe('Random order · finish on bull')
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 'lots' } })).toBe('')
    expect(nextGameSummary(null)).toBe('')
  })

  it('shows a non-straight check-in, not a straight one (one rules line with the match screen)', () => {
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, inMode: 'double', outMode: 'double', firstTo: 3 } })).toBe(
      '501 · Double in · Double out · First to 3 legs',
    )
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 } })).toBe(
      '501 · Double out · First to 3 legs',
    )
  })

  it("fills settings the saved config leaves out from the game's defaults", () => {
    const defaults = { startScore: 501, inMode: 'straight', outMode: 'double', bullOff: 'off', firstTo: 3 }
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 301 } }, defaults)).toBe('301 · Double out · First to 3 legs')
    expect(nextGameSummary({ gameId: 'x01', config: {} }, defaults)).toBe('501 · Double out · First to 3 legs')
    expect(nextGameSummary({ gameId: 'atc', config: { order: 'desc' } }, { order: 'asc', finishOn: 'bull' })).toBe('20–1 · finish on bull')
  })

  it('names the bull off mode when it is on', () => {
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 3, bullOff: 'wdc' } })).toBe(
      '501 · Double out · First to 3 legs · Bull off (WDC)',
    )
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 3, bullOff: 'pdc' } })).toBe(
      '501 · Double out · First to 3 legs · Bull off (PDC)',
    )
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 3, bullOff: 'off' } })).toBe(
      '501 · Double out · First to 3 legs',
    )
  })

  it('a team game names the format first: the sizes of Team A v Team B', () => {
    const x01 = { gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 3, format: 'teams' } }
    expect(nextGameSummary(x01, {}, [2, 2])).toBe('Teams 2v2 · 501 · Double out · First to 3 legs')
    expect(nextGameSummary(x01, {}, [1, 2])).toBe('Teams 1v2 · 501 · Double out · First to 3 legs')
    // Singles: no format
    expect(nextGameSummary(x01, {}, null)).toBe('501 · Double out · First to 3 legs')
  })

  it("writes the feed from the viewer's side, names in bold", () => {
    // A member moving a guest (userId null): never counts as moving themselves, even if named the same
    const moved = act({
      kind: 'board_moved',
      actorUserId: 'chris',
      actorName: 'Christoph',
      data: { name: 'Max', userId: null, fromBoardName: null, toBoardName: 'Living room' },
    })
    expect(text(activityLine(moved, 'chris'))).toBe('You moved Max to Living room')
    expect(text(activityLine(moved, 'lena'))).toBe('Christoph moved Max to Living room')
    expect(bold(activityLine(moved, 'lena'))).toEqual(['Christoph', 'Max'])
    expect(text(activityLine({ ...moved, data: { name: 'Max', userId: null, toBoardName: null } }, 'lena'))).toBe(
      'Christoph moved Max to manual entry',
    )
    const guestNamedChristoph = act({
      kind: 'board_moved',
      actorUserId: 'chris',
      actorName: 'Christoph',
      data: { name: 'Christoph', userId: null, toBoardName: 'Living room' },
    })
    expect(text(activityLine(guestNamedChristoph, 'lena'))).toBe('Christoph moved Christoph to Living room')
    // Moving yourself (same userId as the actor): no name twice
    const self = act({
      kind: 'board_moved',
      actorUserId: 'chris',
      actorName: 'Admin',
      data: { name: 'Admin', userId: 'chris', fromBoardName: 'Dev Board', toBoardName: null },
    })
    expect(text(activityLine(self, 'chris'))).toBe('You moved to manual entry')
    expect(text(activityLine({ ...self, data: { name: 'Admin', userId: 'chris', toBoardName: 'Dev Board' } }, 'chris'))).toBe(
      'You moved to Dev Board',
    )
    expect(text(activityLine(self, 'lena'))).toBe('Admin moved to manual entry')
    expect(bold(activityLine(self, 'lena'))).toEqual(['Admin'])
    expect(text(activityLine(act({}), 'lena'))).toBe('You joined')
    expect(text(activityLine(act({ kind: 'left' }), 'chris'))).toBe('Lena left')
    expect(text(activityLine(act({ kind: 'guest_added', data: { name: 'Pia' } }), 'chris'))).toBe('Lena added guest Pia')
    expect(text(activityLine(act({ kind: 'removed', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Max' } }), 'max'))).toBe(
      'Christoph removed Max',
    )
    expect(text(activityLine(act({ kind: 'host_changed' }), 'chris'))).toBe('Lena is the host now')
    expect(text(activityLine(act({ kind: 'host_changed' }), 'lena'))).toBe("You're the host now")
    expect(
      text(activityLine(act({ kind: 'opened', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Christoph' } }), 'chris')),
    ).toBe('You opened the lobby')
  })

  it('writes game lines, with or without a winner or someone who aborted', () => {
    const played = act({
      kind: 'game_played',
      actorUserId: null,
      actorName: null,
      data: {
        gameId: 'x01',
        winnerName: 'Lena',
        players: [
          { name: 'Lena', placement: 1, forfeited: false },
          { name: 'Max', placement: 2, forfeited: false },
        ],
      },
    })
    expect(text(activityLine(played, 'chris'))).toBe('Played X01 · 2 players · Lena won')
    expect(text(activityLine({ ...played, data: { gameId: 'atc', winnerName: null, players: [] } }, 'chris'))).toBe(
      'Played Around the Clock',
    )
    expect(
      text(activityLine(act({ kind: 'game_aborted', actorUserId: 'chris', actorName: 'Christoph', data: { gameId: 'x01' } }), 'lena')),
    ).toBe('Christoph aborted X01')
    expect(text(activityLine(act({ kind: 'game_aborted', actorUserId: null, actorName: null, data: { gameId: 'x01' } }), 'lena'))).toBe(
      'X01 was aborted',
    )
  })

  it('shows the time of day', () => {
    expect(feedTime(new Date(2026, 9, 2, 21, 6).toISOString())).toBe('21:06')
  })
})

describe('inviteTime', () => {
  const now = new Date(2026, 9, 3, 21, 30)
  it('says how long ago, then the day and time', () => {
    expect(inviteTime(new Date(2026, 9, 3, 21, 29, 40).toISOString(), now)).toBe('just now')
    expect(inviteTime(new Date(2026, 9, 3, 21, 28).toISOString(), now)).toBe('2 min ago')
    expect(inviteTime(new Date(2026, 9, 3, 18, 5).toISOString(), now)).toBe('Today, 18:05')
    expect(inviteTime(new Date(2026, 9, 2, 18, 40).toISOString(), now)).toBe('Yesterday, 18:40')
    expect(inviteTime(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe('28 Sep, 09:00')
  })
})

describe('indicatorView', () => {
  const s = {
    id: 'l1',
    name: 'Friday darts',
    hostName: 'Christoph',
    peopleCount: 6,
    nextGame: { gameId: 'x01', config: {} },
    sessionId: null,
    gameId: null,
    youThrowNext: false,
    leg: null,
    youHost: false,
    solo: false,
  }

  it('a member waiting, the host', () => {
    expect(indicatorView(s)).toEqual({ tag: 'In lobby', name: 'Friday darts', line: '6 people · Next: X01', next: 'Next: X01', back: null })
    expect(indicatorView({ ...s, youHost: true }).tag).toBe('In lobby · Host')
    expect(indicatorView({ ...s, peopleCount: 1, nextGame: null })).toMatchObject({
      line: '1 person · no game picked',
      next: 'no game picked',
    })
  })

  it('a game running: whose turn, and the way back with the leg', () => {
    const playing = { ...s, sessionId: 's1', gameId: 'x01', youThrowNext: true, leg: 1 }
    expect(indicatorView(playing)).toEqual({
      tag: 'In lobby · Playing',
      name: 'Friday darts',
      line: 'X01 · you throw next',
      next: 'you throw next',
      back: { sessionId: 's1', label: 'Back to game · Leg 2' },
    })
    expect(indicatorView({ ...playing, youThrowNext: false, gameId: 'atc', leg: null })).toMatchObject({
      line: 'Around the Clock · game running',
      back: { sessionId: 's1', label: 'Back to game' },
    })
  })
})

describe('personLine', () => {
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
    ...over,
  })
  const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph' })
  const lena = person({
    id: 'l',
    userId: 'lena',
    addedByUserId: 'lena',
    name: 'Lena',
    boardId: 'lenas',
    boardName: "Lena's place",
    usualBoardName: "Lena's place",
  })

  it('says whose guest someone is', () => {
    expect(personLine(person({ name: 'Pia', addedByUserId: 'lena' }), [chris, lena], 'chris')).toBe("Lena's guest")
    expect(personLine(person({ name: 'Pia', addedByUserId: 'lena' }), [chris, lena], 'lena')).toBe('Your guest')
  })

  it('says who moved someone and where they usually play', () => {
    const max = person({
      userId: 'max',
      addedByUserId: 'max',
      name: 'Max',
      boardId: 'living',
      boardName: 'Living room',
      boardMovedBy: 'chris',
      usualBoardName: 'Garage',
    })
    expect(personLine(max, [chris, lena, max], 'chris')).toBe('Moved by you · usually Garage')
    expect(personLine(max, [chris, lena, max], 'lena')).toBe('Moved by Christoph · usually Garage')
    expect(personLine({ ...max, usualBoardName: null }, [chris, lena, max], 'lena')).toBe('Moved by Christoph')
  })

  it('is empty for someone on their usual board', () => {
    expect(personLine(lena, [chris, lena], 'chris')).toBe('')
  })
})

describe('accessHint', () => {
  it('says who can join', () => {
    expect(accessHint('friends')).toBe('Your friends see this lobby in Friends and join without the code. The code and link work too.')
    expect(accessHint('invite')).toBe('Only people with the code, the link or an invite can join.')
  })
})
