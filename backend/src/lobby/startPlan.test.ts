import { describe, it, expect } from 'vitest'
import type { LobbyPerson, LobbyState } from './types.js'
import { planGame } from './startPlan.js'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: true, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris' })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', position: 1 })
const guest = person({ id: 'g', userId: null, addedByUserId: 'lena', name: 'Guest 1', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', position: 2 })
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', position: 3 })   // Manual
const lobby = (over: Partial<LobbyState> = {}): LobbyState => ({
  id: 'l1', name: 'L', hostUserId: 'chris', code: 'AAAAAA', throwOrder: 'lobby', nextGame: null, lastGame: null,
  createdAt: new Date(0), closedAt: null, people: [chris, lena, guest, max], invites: [], activity: [], ...over,
})
const all = { gameId: 'x01', config: { startScore: 301 }, personIds: ['c', 'l', 'g', 'm'] }
const online = { force: false, isBoardOnline: () => true, starterUserId: 'chris' }

describe('planGame', () => {
  it('seats the players in lobby order: members control themselves, guests their adder', () => {
    const r = planGame(lobby(), { ...all, personIds: ['m', 'g', 'c'] }, online)
    expect(r.ok && r.plan.seats).toEqual([
      { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: 'living', boardName: 'Living room' },
      { name: 'Guest 1', userId: null, controllerUserId: 'lena', boardId: 'lenas', boardName: "Lena's place" },
      { name: 'Max', userId: 'max', controllerUserId: 'max', boardId: null, boardName: null },
    ])
    expect(r.ok && r.plan.personIds).toEqual(['c', 'g', 'm'])
    expect(r.ok && r.plan.shuffleSeats).toBe(false)
  })

  it('merges the settings over the game\'s defaults', () => {
    const r = planGame(lobby(), all, online)
    expect(r.ok && r.plan.config).toMatchObject({ startScore: 301, outMode: 'double', bullOff: 'off' })
  })

  it('throw order: bull off turns the game\'s bull off on (keeping PDC), random shuffles, lobby order turns it off', () => {
    const bull = planGame(lobby({ throwOrder: 'bulloff' }), all, online)
    expect(bull.ok && bull.plan.config.bullOff).toBe('wdc')
    const pdc = planGame(lobby({ throwOrder: 'bulloff' }), { ...all, config: { bullOff: 'pdc' } }, online)
    expect(pdc.ok && pdc.plan.config.bullOff).toBe('pdc')
    const random = planGame(lobby({ throwOrder: 'random' }), { ...all, config: { bullOff: 'pdc' } }, online)
    expect(random.ok && random.plan).toMatchObject({ shuffleSeats: true, config: { bullOff: 'off' } })
  })

  it('refuses a bull off for a game without one, an unknown game, nobody playing, and an invalid config', () => {
    expect(planGame(lobby({ throwOrder: 'bulloff' }), { ...all, gameId: 'atc', config: {} }, online)).toMatchObject({ ok: false, problem: { status: 400 } })
    expect(planGame(lobby(), { ...all, gameId: 'nope' }, online)).toMatchObject({ ok: false, problem: { status: 400, error: 'unknown game: nope' } })
    expect(planGame(lobby(), { ...all, personIds: [] }, online)).toMatchObject({ ok: false, problem: { status: 400, error: 'nobody plays' } })
    // X01's bull off needs two players
    expect(planGame(lobby({ throwOrder: 'bulloff' }), { ...all, personIds: ['c'] }, online)).toMatchObject({ ok: false, problem: { status: 400 } })
  })

  it('refuses offline boards by name, even when the host confirmed; Manual seats are always fine', () => {
    const opts = { force: true, isBoardOnline: (b: string) => b !== 'lenas', starterUserId: 'chris' }
    expect(planGame(lobby(), all, opts)).toEqual({
      ok: false, problem: { status: 409, code: 'board_offline', error: "offline: Lena's place", offlineBoards: ["Lena's place"] },
    })
    expect(planGame(lobby(), { ...all, personIds: ['c', 'm'] }, opts).ok).toBe(true)
  })

  it('names who isn\'t ready, and starts anyway once the host confirms', () => {
    // lena starts here, so chris and max (not the starter, nor their guest) still show as not ready
    const notReady = lobby({ people: [{ ...chris, ready: false }, lena, { ...max, ready: false }] })
    const startedByLena = { ...online, starterUserId: 'lena' }
    expect(planGame(notReady, all, startedByLena)).toEqual({
      ok: false, problem: { status: 409, code: 'not_ready', error: 'not everyone is ready', notReady: [{ personId: 'c', name: 'Christoph' }, { personId: 'm', name: 'Max' }] },
    })
    expect(planGame(notReady, all, { ...startedByLena, force: true }).ok).toBe(true)
  })

  it('counts the starter and the rows they control as ready', () => {
    const notReady = lobby({ people: [{ ...chris, ready: false }, { ...guest, addedByUserId: 'chris', ready: false }, { ...lena, ready: false }] })
    const r = planGame(notReady, { ...all, personIds: ['c', 'g', 'l'] }, { ...online, starterUserId: 'chris' })
    expect(!r.ok && r.problem).toMatchObject({ code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }] })
    const solo = planGame(lobby({ people: [{ ...chris, ready: false }, { ...guest, addedByUserId: 'chris', ready: false }] }), { ...all, personIds: ['c', 'g'] }, { ...online, starterUserId: 'chris' })
    expect(solo.ok).toBe(true)
  })
})
