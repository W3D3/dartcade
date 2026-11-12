// The My tournaments tab for one player (GET /api/tournaments/mine): what they play in, organize
// and have played, the match running now and their results this quarter.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import { listOrganizedTournaments, type TournamentView } from '../db/tournaments.js'
import { averageParts, claimedCounts, listSpots, openMatches, recordOf, unconfirmedTeammates } from '../db/tournamentMine.js'
import { matchTitle, quarterOf } from '../shared/tournaments/mine.js'

type MyTournaments = components['schemas']['MyTournaments']
type Ref = components['schemas']['MyTournamentRef']

const MAX_PAST = 50

export const refOf = (t: TournamentView): Ref => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  access: t.access,
  status: t.status,
  gameId: t.game_id,
  gameConfig: t.game_config,
  format: t.format,
  teamSize: t.team_size,
  maxEntries: t.max_entries,
  entries: t.entries,
  startsAt: t.starts_at?.toISOString() ?? null,
  owner: t.owner_user_id !== null && t.owner_name !== null ? { id: t.owner_user_id, name: t.owner_name } : null,
})

const byStart = (a: TournamentView, b: TournamentView) =>
  // Organizer-started ones (no start time) last
  (a.starts_at?.getTime() ?? Infinity) - (b.starts_at?.getTime() ?? Infinity) || a.created_at.getTime() - b.created_at.getTime()

const round1 = (n: number) => Math.round(n * 10) / 10
const averageOf = (p: { weighted: number; darts: number } | undefined) => (p && p.darts > 0 ? round1(p.weighted / p.darts) : null)

export async function myTournaments(db: Kysely<Database>, userId: string, now: Date): Promise<MyTournaments> {
  const [spots, organized] = await Promise.all([listSpots(db, userId), listOrganizedTournaments(db, userId)])
  const current = spots.filter(s => s.t.status !== 'finished').sort((a, b) => byStart(a.t, b.t))
  const finished = spots.filter(s => s.t.status === 'finished')
  const [waiting, matches, record, averages, claimed] = await Promise.all([
    unconfirmedTeammates(
      db,
      current.map(s => s.entryId),
      userId,
    ),
    openMatches(
      db,
      current.map(s => s.entryId),
    ),
    recordOf(
      db,
      finished.map(s => s.entryId),
    ),
    averageParts(
      db,
      finished.map(s => s.playerId),
    ),
    claimedCounts(
      db,
      organized.filter(t => t.access === 'in_person').map(t => t.id),
    ),
  ])

  const live = matches.find(m => m.status === 'live' && m.sessionId !== null)
  const liveSpot = live && current.find(s => s.entryId === live.entryId)

  const { label, start } = quarterOf(now)
  const season = finished.filter(s => s.t.ended_at !== null && s.t.ended_at >= start)
  const seasonRecord = season.map(s => record.get(s.entryId) ?? { won: 0, lost: 0 })
  const best = season
    .filter(s => s.finalPlace !== null)
    .sort((a, b) => (a.finalPlace ?? 0) - (b.finalPlace ?? 0))
    .at(0)
  const seasonParts = season.flatMap(s => averages.get(s.playerId) ?? [])

  const past = finished.sort((a, b) => (b.t.ended_at?.getTime() ?? 0) - (a.t.ended_at?.getTime() ?? 0))

  return {
    liveMatch:
      live && liveSpot && live.sessionId
        ? {
            tournament: refOf(liveSpot.t),
            round: matchTitle({ bracket: live.bracket, group: live.groupNo, round: live.round }, live.mainRounds),
            opponent: live.opponent ?? 'your opponent',
            firstTo: live.firstTo,
            sessionId: live.sessionId,
          }
        : null,
    playing: current.map(s => ({
      tournament: refOf(s.t),
      entryName: s.entryName,
      playerName: s.playerName,
      waitingFor: waiting.get(s.entryId) ?? [],
      opponent: matches.find(m => m.entryId === s.entryId && m.opponent !== null)?.opponent ?? null,
    })),
    organizing: organized
      .filter(t => t.status !== 'finished' && t.status !== 'cancelled')
      .map(t => ({
        tournament: refOf(t),
        role: t.owner_user_id === userId ? ('owner' as const) : ('organizer' as const),
        claimed: t.access === 'in_person' ? (claimed.get(t.id) ?? 0) : null,
        createdAt: t.created_at.toISOString(),
      })),
    past: past.slice(0, MAX_PAST).map(s => ({
      tournament: refOf(s.t),
      entryName: s.entryName,
      playerName: s.playerName,
      place: s.finalPlace,
      won: record.get(s.entryId)?.won ?? 0,
      lost: record.get(s.entryId)?.lost ?? 0,
      average: averageOf(averages.get(s.playerId)),
      endedAt: s.t.ended_at?.toISOString() ?? null,
    })),
    pastTotal: past.length,
    season: {
      label,
      played: season.length,
      titles: season.filter(s => s.finalPlace === 1).length,
      won: seasonRecord.reduce((n, r) => n + r.won, 0),
      lost: seasonRecord.reduce((n, r) => n + r.lost, 0),
      average: averageOf({
        weighted: seasonParts.reduce((n, p) => n + p.weighted, 0),
        darts: seasonParts.reduce((n, p) => n + p.darts, 0),
      }),
      best: best && best.finalPlace !== null ? { place: best.finalPlace, tournament: best.t.name } : null,
    },
  }
}
