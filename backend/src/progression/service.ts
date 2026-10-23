// Pays XP when a game ends: loads the finished game from the database (its final darts and result),
// asks the pure rules (rules.ts) what each account earned, writes the ledger rows and the totals in
// one transaction per account, and tells the account's open pages on /ws/me. Running it twice for a
// game writes nothing new: the ledger is unique per account, reason and game.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/progression.js'
import type { XpGame, LedgerLine } from '../db/progression.js'
import { gameAwards, PERSONAL_BESTS, reachedPerks, streakAwards, type PlayerGame } from './rules.js'
import { levelOf, localDate, stepStreak } from '../shared/progression.js'
import type { XpGainedMessage, XpLine } from '../schema/lobby-ws.js'
import type { GameEnded } from '../session/engine.js'
import type { X01Detail } from '../session/types.js'
import { getFinishedGame } from '../db/history.js'
import { getSessionEvents } from '../db/queries.js'
import { buildDetail } from '../history/detail.js'
import { progressChallenges } from './challengeSets.js'
import { challengeGame } from './facts.js'

export type ProgressionDeps = {
  db: Kysely<Database>
  /** Whether progression.enabled is on for the account: a game pays only those it is on for. */
  enabled: (userId: string) => Promise<boolean>
  /** Whether progression.manualDarts is on for the account: its typed-in darts count for challenges. */
  manualDarts?: (userId: string) => Promise<boolean>
  /** Sends the account's /ws/me sockets the message. */
  push: (userId: string, msg: XpGainedMessage) => void | Promise<void>
  warn: (message: string, details: unknown) => void
}

const LINE_KINDS = ['game', 'win', 'ranked', 'daily', 'challenge', 'milestone'] as const

/** A ledger row as a line of the breakdown. */
export function xpLine(r: LedgerLine): XpLine {
  const count = (key: string) => (typeof r.meta[key] === 'number' ? { count: r.meta[key] } : {})
  switch (r.sourceType) {
    case 'game:180':
      return { kind: 'oneEighty', amount: r.amount, ...count('count') }
    case 'game:checkout':
      return { kind: 'checkout', amount: r.amount }
    case 'game:best':
      return { kind: 'personalBest', amount: r.amount }
    case 'day':
      if (r.kind === 'daily') return { kind: 'daily', amount: r.amount, ...count('streak') }
  }
  if (r.kind === 'dart') return { kind: 'dart', amount: r.amount, ...count('darts') }
  if (r.kind === 'challenge' && typeof r.meta.title === 'string') return { kind: 'challenge', amount: r.amount, title: r.meta.title }
  return { kind: LINE_KINDS.find(k => k === r.kind) ?? 'game', amount: r.amount }
}

/** The account's seat and what the rules need to know about it; null for a seat that earns nothing. */
export function playerGame(game: XpGame, userId: string): Omit<PlayerGame, 'previousBest'> | null {
  const me = game.seats.find(s => s.userId === userId)
  if (!me) return null
  // Your own guests (and you on another seat) don't count as opponents
  const opponents = game.seats
    .filter(s => s.placement !== me.placement)
    .flatMap((s): ('human' | 'bot')[] => {
      if (s.bot) return ['bot']
      const account = s.userId ?? s.controllerUserId
      return account !== null && account !== userId ? ['human'] : []
    })
  return {
    gameId: game.gameId,
    ranked: game.rankedUserIds.has(userId),
    placement: me.placement,
    forfeited: me.forfeited,
    stats: me.stats,
    opponents,
    darts: game.darts.get(me.seat) ?? { total: 0, camera: 0, oneEighties: 0 },
  }
}

export class ProgressionService {
  constructor(private readonly deps: ProgressionDeps) {}

  /** The engine's game-end hook: a finished game pays its players. */
  async onGameEnded(e: Pick<GameEnded, 'sessionId' | 'status'>): Promise<void> {
    if (e.status !== 'finished') return
    await this.awardGame(e.sessionId)
  }

  /** Pays every account seated in the game what it hasn't been paid yet; pushes what's new. */
  async awardGame(sessionId: string, opts: { backfill?: boolean } = {}): Promise<void> {
    const game = await q.getXpGame(this.deps.db, sessionId)
    if (!game) return
    // One account earns once per game, however many seats it holds
    const userIds = [...new Set(game.seats.flatMap(s => (s.userId !== null && !s.bot ? [s.userId] : [])))]
    const x01 = !opts.backfill && game.gameId === 'x01' ? await this.x01Detail(game.id) : null
    for (const userId of userIds) {
      // The backfill pays history for everyone, so turning the flag on later loses nothing
      if (!opts.backfill && !(await this.deps.enabled(userId))) continue
      const gained = await this.awardPlayer(game, userId, opts.backfill ?? false, x01)
      if (gained && !opts.backfill) {
        try {
          await this.deps.push(userId, gained)
        } catch (err) {
          this.deps.warn('xp push failed', { sessionId, userId, error: String(err) })
        }
      }
    }
  }

  // The X01 replay: each visit's score and bust, who won each leg (the history's detail)
  private async x01Detail(sessionId: string): Promise<X01Detail | null> {
    const game = await getFinishedGame(this.deps.db, sessionId)
    if (!game) return null
    const built = await buildDetail(game, await getSessionEvents(this.deps.db, sessionId), this.deps.warn)
    return built?.detail.mode === 'x01' ? built.detail : null
  }

  private async awardPlayer(game: XpGame, userId: string, backfill: boolean, x01: X01Detail | null): Promise<XpGainedMessage | null> {
    const player = playerGame(game, userId)
    if (!player) return null
    return this.deps.db.transaction().execute(async trx => {
      await q.lockUser(trx, userId)
      const day = localDate(game.finishedAt, await q.userTimeZone(trx, userId))
      const pb = PERSONAL_BESTS[game.gameId]
      const previousBest = pb && !backfill ? await q.previousBest(trx, userId, game.gameId, pb.key, pb.higher, game.id) : null
      const awards = gameAwards({ ...player, previousBest, backfill }, await q.dayTally(trx, userId, day, game.id))
      const written = await q.insertAwards(trx, userId, game.id, day, awards, game.finishedAt)
      // A newly paid qualifying game is the day's streak game if it's the first one
      let streak: XpGainedMessage['streak']
      if (!backfill && written.some(r => r.kind === 'game')) {
        const step = stepStreak(await q.getStreak(trx, userId), day)
        if (step.counted) {
          await q.saveStreak(trx, userId, step.next)
          written.push(...(await q.insertAwards(trx, userId, game.id, day, streakAwards(step, day, game.id), game.finishedAt)))
          streak = {
            current: step.next.current,
            freezes: step.next.freezes,
            frozeDay: step.frozeDay,
            milestone: step.milestone?.days ?? null,
          }
        }
      }
      // Finished challenges pay when claimed on Progress, not here
      let challenges: XpGainedMessage['challenges']
      if (!backfill) {
        const manualDarts = (await this.deps.manualDarts?.(userId)) ?? false
        const done = await progressChallenges(trx, userId, day, challengeGame(game, userId, player, x01, manualDarts), game.finishedAt)
        if (done.length > 0) challenges = done
      }
      if (written.length === 0 && !challenges) return null
      const total = written.reduce((a, r) => a + r.amount, 0)
      const { before, after } = await q.addXp(trx, userId, total)
      // Perks reached: kept for good, whatever the curve does later
      const unlocks = await q.unlock(
        trx,
        userId,
        reachedPerks({
          level: levelOf(after).level,
          streak: streak?.current ?? 0,
          ranked: backfill ? { wins: 0, bestRank: null } : await q.rankedDeeds(trx, userId),
        }),
        game.finishedAt,
      )
      return {
        type: 'xp.gained',
        sessionId: game.id,
        lines: written.filter(r => r.amount > 0).map(xpLine),
        total,
        xpBefore: before,
        xpAfter: after,
        levelBefore: levelOf(before).level,
        levelAfter: levelOf(after).level,
        ...(streak && { streak }),
        ...(challenges && { challenges }),
        ...(unlocks.length > 0 && { unlocks }),
      } satisfies XpGainedMessage
    })
  }

  /**
   * Pays the finished games from before progression existed, once (game, win and dart XP only, on
   * the day they were played). Resumes after a restart: paid games write nothing new.
   */
  async backfill(): Promise<number> {
    if (await q.backfillDone(this.deps.db)) return 0
    const ids = await q.finishedGameIds(this.deps.db)
    for (const id of ids) await this.awardGame(id, { backfill: true })
    await q.markBackfillDone(this.deps.db)
    return ids.length
  }
}
