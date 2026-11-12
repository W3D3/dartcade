import { describe, expect, it } from 'vitest'
import type { AvgLimit } from '$shared/tournaments/avgLimit'
import {
  holdNote,
  limitLine,
  pickRows,
  sendLabel,
  sendProblem,
  teamStatus,
  toAsk,
  waitingCard,
  type TeamEntry,
  type TeamOption,
} from './roster'

const avatar = { kind: 'none' } as const
const member = (id: string, name: string, average: number | null, more: Partial<TeamOption['members'][number]> = {}) => ({
  user: { id, name, avatar },
  form: { average, legs: 30 },
  board: `${name}'s board`,
  taken: false,
  ...more,
})
// Double Agents, as on the board: Christoph captains Lena and Max
const team: TeamOption = {
  id: 'da',
  name: 'Double Agents',
  tag: 'DA',
  color: '#9b7bff',
  captainId: 'c',
  entered: false,
  members: [member('c', 'Christoph', 68.4, { board: 'Living room' }), member('l', 'Lena', 61.2), member('m', 'Max', 41.2)],
}
const teamAvg: AvgLimit = { min: 55, max: null, teams: 'team', minLegs: 0, lock: true }
const rules = (avgLimit: AvgLimit | null = teamAvg) => ({
  teamSize: 2,
  settings: {
    avgLimit,
    manualScoring: false,
    seeding: 'random' as const,
    firstTo: 3,
    longerFinal: null,
    groups: null,
    registrationClosesMinutes: 60 as const,
    checkInMinutes: 30 as const,
    plannedFor: null,
    noShowMinutes: 10 as const,
  },
})

describe('Who plays?', () => {
  it('reads like the board for the captain', () => {
    const rows = pickRows(rules(), team, ['c', 'l'], 'c')
    expect(rows.map(r => [r.member.user.name, r.picked, r.detail])).toEqual([
      ['Christoph', true, 'You · 30-day avg 68.4 · board: Living room'],
      ['Lena', true, '30-day avg 61.2 · will get a request to confirm'],
      ['Max', false, '30-day avg 41.2'],
    ])
    expect(limitLine(rules(), team, ['c', 'l'])).toEqual({ lead: 'Team average: ', value: '64.8', tail: ' · needs 55+', fits: true })
    expect(sendLabel(toAsk(team, ['c', 'l'], 'c'))).toBe('Send request to Lena')
    expect(sendProblem(rules(), team, ['c', 'l'], 'c')).toBeNull()
  })

  it('says who would break the team average before they are picked', () => {
    const max = pickRows(rules(), team, ['c'], 'c').find(r => r.member.user.id === 'm')
    expect(max?.detail).toBe('30-day avg 41.2 · with Max the team average is 54.8, needs 55+')
    expect(limitLine(rules(), team, ['c', 'm'])?.fits).toBe(false)
    expect(sendProblem(rules(), team, ['c', 'm'], 'c')).toBe('Outside the average limit')
  })

  it('lets only the captain pick: everyone else sees why', () => {
    const rows = pickRows(rules(), { ...team, captainId: 'l' }, [], 'c')
    expect(rows.every(r => r.disabled)).toBe(true)
    expect(rows[1]?.detail).toBe('30-day avg 61.2 · captain · only the captain can register this team')
    expect(sendProblem(rules(), { ...team, captainId: 'l' }, ['c', 'l'], 'c')).toBe('Only the captain can register this team')
  })

  it('switches off players already in, without a board, and past the team size', () => {
    const t = { ...team, members: [team.members[0], member('l', 'Lena', 61.2, { taken: true }), member('m', 'Max', 41.2, { board: null })] }
    const rows = pickRows(rules(null), t, ['c'], 'c')
    expect(rows.map(r => [r.disabled, r.detail])).toEqual([
      [false, 'You · 30-day avg 68.4 · board: Living room'],
      [true, '30-day avg 61.2 · already in this tournament'],
      [true, '30-day avg 41.2 · no paired board'],
    ])
    expect(pickRows(rules(null), team, ['c', 'l'], 'c')[2]?.disabled).toBe(true)
    expect(sendProblem(rules(null), team, ['c'], 'c')).toBe('Pick 2')
  })

  it('tells how long the spot is held', () => {
    expect(holdNote(['Lena'], null)).toBe(
      'Lena gets a request to confirm. Your team’s spot is held until everyone has confirmed, or until an organizer starts the tournament. If someone declines you can pick another teammate.',
    )
    expect(sendLabel(['Lena', 'Max'])).toBe('Send requests to Lena and Max')
  })
})

describe('a team still to complete', () => {
  const entry = (slots: TeamEntry['slots'], status: TeamEntry['status'] = 'pending'): TeamEntry => ({
    entryId: 'e',
    status,
    team: { id: 'da', name: 'Double Agents', tag: 'DA', color: '#9b7bff' },
    captainId: 'c',
    confirmBy: null,
    slots,
  })
  const chris = { position: 0, user: { id: 'c', name: 'Christoph' }, confirmed: true }
  const lena = { position: 1, user: { id: 'l', name: 'Lena' }, confirmed: false }

  it('waits on Lena', () => {
    expect(waitingCard(entry([chris, lena]), 'November Doubles Cup')).toEqual({
      title: 'Waiting on Lena for November Doubles Cup',
      detail: 'You registered Double Agents with Lena · they have until the start to confirm',
    })
    expect(teamStatus(entry([chris, lena]), 'c')).toEqual({ short: '1 to confirm', long: 'Waiting for Lena to confirm', mine: false })
    expect(teamStatus(entry([chris, lena]), 'l')).toEqual({ short: 'Confirm', long: 'Confirm your place', mine: true })
  })

  it('asks for another player once someone declined', () => {
    const open = entry([chris, { position: 1, user: null, confirmed: false }])
    expect(waitingCard(open, 'Cup')?.title).toBe('Pick a player for Cup')
    expect(teamStatus(open, 'c')?.long).toBe('Pick another player')
  })

  it('is quiet once registered', () => {
    expect(waitingCard(entry([chris, { ...lena, confirmed: true }], 'registered'), 'Cup')).toBeNull()
    expect(teamStatus(entry([chris, { ...lena, confirmed: true }], 'registered'), 'c')).toBeNull()
  })
})
