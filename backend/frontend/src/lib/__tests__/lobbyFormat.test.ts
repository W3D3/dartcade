import { describe, it, expect } from 'vitest'
import { activityLine, feedTime, formatCode, gameName, joinLink, nextGameSummary, type Part } from '../lobby/format.js'
import type { LobbyActivity } from '../api/lobby-ws'

const text = (parts: Part[]) => parts.map(p => p.text).join('')
const bold = (parts: Part[]) => parts.filter(p => p.bold).map(p => p.text)
const act = (over: Partial<LobbyActivity>): LobbyActivity => ({
  id: '1', at: '2026-10-02T19:40:00.000Z', kind: 'joined', actorUserId: 'lena', actorName: 'Lena', data: { name: 'Lena' }, ...over,
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
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 2 } })).toBe('501 · Double out · First to 2 legs')
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 301, outMode: 'straight', firstTo: 1 } })).toBe('301 · Straight out · First to 1 leg')
    expect(nextGameSummary({ gameId: 'atc', config: { order: 'random', finishOn: 'bull' } })).toBe('Random order · finish on bull')
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 'lots' } })).toBe('')
    expect(nextGameSummary(null)).toBe('')
  })

  it('writes the feed from the viewer\'s side, names in bold', () => {
    const moved = act({ kind: 'board_moved', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Max', fromBoardName: null, toBoardName: 'Living room' } })
    expect(text(activityLine(moved, 'chris'))).toBe('You moved Max to Living room')
    expect(text(activityLine(moved, 'lena'))).toBe('Christoph moved Max to Living room')
    expect(bold(activityLine(moved, 'lena'))).toEqual(['Christoph', 'Max'])
    expect(text(activityLine({ ...moved, data: { name: 'Max', toBoardName: null } }, 'lena'))).toBe('Christoph moved Max to manual entry')
    expect(text(activityLine(act({}), 'lena'))).toBe('You joined')
    expect(text(activityLine(act({ kind: 'left' }), 'chris'))).toBe('Lena left')
    expect(text(activityLine(act({ kind: 'guest_added', data: { name: 'Pia' } }), 'chris'))).toBe('Lena added guest Pia')
    expect(text(activityLine(act({ kind: 'removed', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Max' } }), 'max'))).toBe('Christoph removed Max')
    expect(text(activityLine(act({ kind: 'host_changed' }), 'chris'))).toBe('Lena is the host now')
    expect(text(activityLine(act({ kind: 'host_changed' }), 'lena'))).toBe("You're the host now")
    expect(text(activityLine(act({ kind: 'opened', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Christoph' } }), 'chris'))).toBe('You opened the lobby')
  })

  it('writes game lines, with or without a winner or someone who aborted', () => {
    const played = act({ kind: 'game_played', actorUserId: null, actorName: null, data: { gameId: 'x01', winnerName: 'Lena', players: [
      { name: 'Lena', placement: 1, forfeited: false }, { name: 'Max', placement: 2, forfeited: false },
    ] } })
    expect(text(activityLine(played, 'chris'))).toBe('Played X01 · 2 players · Lena won')
    expect(text(activityLine({ ...played, data: { gameId: 'atc', winnerName: null, players: [] } }, 'chris'))).toBe('Played Around the Clock')
    expect(text(activityLine(act({ kind: 'game_aborted', actorUserId: 'chris', actorName: 'Christoph', data: { gameId: 'x01' } }), 'lena'))).toBe('Christoph aborted X01')
    expect(text(activityLine(act({ kind: 'game_aborted', actorUserId: null, actorName: null, data: { gameId: 'x01' } }), 'lena'))).toBe('X01 was aborted')
  })

  it('shows the time of day', () => {
    expect(feedTime(new Date(2026, 9, 2, 21, 6).toISOString())).toBe('21:06')
  })
})
