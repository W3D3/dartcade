import { describe, expect, it, vi } from 'vitest'
import {
  addParsed,
  allClaimLinks,
  claimedLine,
  addedLine,
  autoTag,
  draftBlocker,
  draftProblems,
  emptyDraft,
  fullestTeam,
  newTeam,
  overflow,
  parseList,
  soloEntry,
  toBody,
  type ParticipantsDraft,
} from './participants'

const names = (d: ParticipantsDraft, teams = false) => (teams ? d.teams : d.solo).map(e => [e.name, e.players.map(p => p.name)])

describe('parseList', () => {
  it('reads one name per line, skipping blank lines and a header', () => {
    expect(parseList('Name\nAnna Berger\n\n  Jonas  \r\n"Mia K."\n', false)).toEqual([
      { name: 'Anna Berger', players: ['Anna Berger'] },
      { name: 'Jonas', players: ['Jonas'] },
      { name: 'Mia K.', players: ['Mia K.'] },
    ])
  })

  it('reads teams as Team; Player; Player, and CSV commas or tabs the same', () => {
    expect(parseList('Treble Trouble; Anna; Jonas\nOche Owls,Mia,Paul\nBar Flies\tSven', true)).toEqual([
      { name: 'Treble Trouble', players: ['Anna', 'Jonas'] },
      { name: 'Oche Owls', players: ['Mia', 'Paul'] },
      { name: 'Bar Flies', players: ['Sven'] },
    ])
  })

  it('takes the first column of a solo CSV row', () => {
    expect(parseList('Anna,anna@example.com', false)).toEqual([{ name: 'Anna', players: ['Anna'] }])
  })
})

describe('addParsed', () => {
  it('leaves out names already on the list or twice in the paste, ignoring case', () => {
    const d = { ...emptyDraft(), solo: [soloEntry('Anna')] }
    const r = addParsed(d, parseList('anna\nJonas\nJONAS\nMia', false), 1)
    expect(names(r.draft)).toEqual([
      ['Anna', ['Anna']],
      ['Jonas', ['Jonas']],
      ['Mia', ['Mia']],
    ])
    expect(addedLine(r, 1)).toBe('Added 2 players. 2 names were already on the list.')
  })

  it('caps the list at the most entries and a team at its size', () => {
    const r = addParsed(emptyDraft(), parseList('A; a1; a2; a3\nB; b1\nC; c1', true), 2, 2)
    expect(names(r.draft, true)).toEqual([
      ['A', ['a1', 'a2']],
      ['B', ['b1']],
    ])
    expect(r.overCap).toBe(2)
    expect(r.draft.teams.map(t => t.tag)).toEqual(['TM', 'TM'])
  })
})

describe('teams', () => {
  it('tags a team by its initials', () => {
    expect(autoTag('Treble Trouble')).toBe('TT')
    expect(autoTag('Owls')).toBe('OWL')
    expect(autoTag('180')).toBe('TM')
  })

  it('names the players a smaller team size removes, and keeps them in the draft until saved', () => {
    const teams = [newTeam(0, 'Treble Trouble', ['Anna', 'Jonas', 'Kim']), newTeam(1, 'Bar Flies', ['Sven', 'Lea'])]
    expect(overflow(teams, 2)).toEqual([{ team: 'Treble Trouble', player: 'Kim' }])
    expect(fullestTeam(teams)).toBe(3)
    const body = toBody({ solo: [], teams }, 2)
    expect(body.entries.map(e => e.players.map(p => p.name))).toEqual([
      ['Anna', 'Jonas'],
      ['Sven', 'Lea'],
    ])
    expect(teams[0].players).toHaveLength(3)
  })

  it('says a team with an empty spot blocks the start', () => {
    const d = { solo: [], teams: [newTeam(0, 'Treble Trouble', ['Anna', 'Jonas', 'Kim']), newTeam(1, 'Bar Flies', ['Sven', 'Lea'])] }
    expect(draftBlocker(d, 3)).toBe('Bar Flies still needs a 3rd player before you can start.')
  })
})

describe('toBody and draftProblems', () => {
  it('drops blank solo rows and sends the stored ids', () => {
    const d = { ...emptyDraft(), solo: [{ ...soloEntry('Anna'), id: 'e1' }, soloEntry('  ')] }
    d.solo[0].players[0].id = 's1'
    expect(toBody(d, 1)).toEqual({ entries: [{ id: 'e1', name: 'Anna', tag: null, color: null, players: [{ id: 's1', name: 'Anna' }] }] })
  })

  it('reports a duplicate name as the server would', () => {
    const d = { ...emptyDraft(), solo: [soloEntry('Tom'), soloEntry('tom')] }
    expect(draftProblems(d, 1, 64)).toEqual(['Participants: two players have this name'])
  })
})

describe('the organizer page lines', () => {
  const spot = (name: string, claimed = false) => ({
    id: name,
    name,
    claimCode: `c-${name}`,
    claimedBy: claimed ? { id: 'u', name: 'u' } : null,
  })
  const p = {
    entries: [
      { id: 'a', name: 'Treble Trouble', tag: 'TT', color: null, players: [spot('Anna', true), spot('Jonas')] },
      { id: 'b', name: 'Oche Owls', tag: 'OWL', color: null, players: [spot('Mia')] },
    ],
    startBlocker: null,
  }

  it('counts the claimed spots', () => {
    expect(claimedLine(p, true)).toBe('2 teams · 1 of 3 claimed')
    expect(claimedLine(p, false)).toBe('3 · 1 claimed')
  })

  it('copies every unclaimed claim link with its team', () => {
    vi.stubGlobal('location', { origin: 'https://dartcade.test' })
    expect(allClaimLinks(p, true).split('\n')).toEqual([
      `Treble Trouble · Jonas: https://dartcade.test/#/tournaments/claim/c-Jonas`,
      `Oche Owls · Mia: https://dartcade.test/#/tournaments/claim/c-Mia`,
    ])
    vi.unstubAllGlobals()
  })
})
