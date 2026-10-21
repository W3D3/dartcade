import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { gameLines, getProgress, getStreak, lockUser, streakDays, unlockedPerks, userTimeZone } from '../db/progression.js'
import { headToHead, modeCounts, profileUser, recentGames } from '../db/profile.js'
import { getRatings, x01Average } from '../db/ranked.js'
import { areFriends } from '../db/friends.js'
import { getPreferences, updatePreferences } from '../db/users.js'
import { PERKS, equippedOf, levelPerks, perk, streakNow, type Equipped, type PerkKind } from '../shared/progression.js'
import { RANKED_MODES } from '../shared/ranked.js'
import { xpLine } from '../progression/service.js'
import { addDays, levelOf, localDate } from '../shared/progression.js'
import { dayStreak } from '../progression/view.js'
import { challengesView, ensureSets, reroll } from '../progression/challengeSets.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Progression: your XP, level and day streak, what a game paid you, your challenges. All 404 while progression.enabled is off for you. */
export function progressApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const requireProgression = async (userId: string) => {
    if (!(await flagEnabled('progression.enabled', await loadFlagUser(db, userId)))) throw new ApiError(404, { error: 'not found' })
  }

  app.get<Route<'getMyProgress'>>('/api/progress/me', { preValidation: requireAuth, schema: fromSpec('getMyProgress') }, async req => {
    await requireProgression(req.userId)
    const today = localDate(new Date(), await userTimeZone(db, req.userId))
    const [{ xp }, streak, days, sets, perks] = await Promise.all([
      getProgress(db, req.userId),
      getStreak(db, req.userId),
      streakDays(db, req.userId, addDays(today, -6), today),
      ensureSets(db, req.userId, today),
      perksOf(req.userId),
    ])
    return {
      xp,
      level: levelOf(xp).level,
      streak: dayStreak(streak, today, days.played, days.frozen),
      dailyOpen: sets.daily.filter(c => c.completedAt === null).length,
      perks,
    }
  })

  app.get<Route<'getGameXp'>>('/api/progress/games/:id', { preValidation: requireAuth, schema: fromSpec('getGameXp') }, async req => {
    await requireProgression(req.userId)
    const rows = await gameLines(db, req.userId, req.params.id)
    if (rows.length === 0) throw new ApiError(404, { error: 'not found' })
    const { xp } = await getProgress(db, req.userId)
    return {
      lines: rows.filter(r => r.amount > 0).map(xpLine),
      total: rows.reduce((a, r) => a + r.amount, 0),
      xp,
    }
  })

  // The level 1 perks are everyone's; the rest are the rows unlocking wrote
  async function perksOf(userId: string): Promise<{ unlocked: string[]; equipped: Equipped }> {
    const [rows, prefs] = await Promise.all([unlockedPerks(db, userId), getPreferences(db, userId)])
    return {
      unlocked: [...levelPerks(1).map(p => p.id), ...rows.filter(id => perk(id) !== undefined)],
      equipped: equippedOf(prefs?.equipped),
    }
  }

  app.put<Route<'equipPerks'>>('/api/progress/equip', { preValidation: requireAuth, schema: fromSpec('equipPerks') }, async req => {
    await requireProgression(req.userId)
    const { unlocked, equipped } = await perksOf(req.userId)
    const next: Equipped = { ...equipped }
    for (const kind of ['title', 'banner', 'colors'] as const satisfies readonly PerkKind[]) {
      const id = req.body[kind]
      if (id === undefined) continue
      if (perk(id)?.kind !== kind || !unlocked.includes(id)) throw new ApiError(409, { error: `${kind} is not unlocked` })
      next[kind] = id
    }
    await updatePreferences(db, req.userId, { equipped: next })
    return { unlocked, equipped: next }
  })

  app.get<Route<'getPlayerProfile'>>(
    '/api/users/:id/profile',
    { preValidation: requireAuth, schema: fromSpec('getPlayerProfile') },
    async req => {
      await requireProgression(req.userId)
      const id = req.params.id
      const user = await profileUser(db, id)
      if (!user) throw new ApiError(404, { error: 'not found' })
      const self = id === req.userId
      const friend = !self && (await areFriends(db, req.userId, id))
      const [{ xp }, streak, modes, ratings, average, h2h, recent, unlocked, zone] = await Promise.all([
        getProgress(db, id),
        getStreak(db, id),
        modeCounts(db, id),
        getRatings(db, id),
        x01Average(db, id),
        self ? null : headToHead(db, req.userId, id),
        recentGames(db, id, req.userId),
        self ? unlockedPerks(db, id) : [],
        userTimeZone(db, id),
      ])
      return {
        id: user.id,
        name: user.name,
        memberSince: user.createdAt.toISOString(),
        relation: self ? 'self' : friend ? 'friend' : 'stranger',
        avatar: user.avatar,
        look: equippedOf(user.equipped),
        level: levelOf(xp).level,
        // The rating stays hidden until the player is placed
        ranked: RANKED_MODES.map(mode => {
          const r = ratings[mode]
          return { mode, rankIndex: r.rankIndex, rating: r.rankIndex === null ? null : r.rating, matches: r.matches, wins: r.wins }
        }),
        streak: self || friend ? streakNow(streak, localDate(new Date(), zone)) : null,
        average,
        favourite: modes[0]?.mode ?? null,
        matches: modes.reduce((a, m) => a + m.games, 0),
        headToHead: h2h,
        playsMost: modes.slice(0, 3),
        recent: recent.map(g => ({ ...g, finishedAt: g.finishedAt.toISOString() })),
        xp: self ? xp : null,
        collection: self ? { unlocked: levelPerks(1).length + unlocked.filter(p => perk(p)).length, total: PERKS.length } : null,
      }
    },
  )

  app.get<Route<'getChallenges'>>('/api/challenges', { preValidation: requireAuth, schema: fromSpec('getChallenges') }, async req => {
    await requireProgression(req.userId)
    const zone = await userTimeZone(db, req.userId)
    return challengesView(db, req.userId, localDate(new Date(), zone), zone)
  })

  app.post<Route<'rerollChallenge'>>(
    '/api/challenges/:id/reroll',
    { preValidation: requireAuth, schema: fromSpec('rerollChallenge') },
    async req => {
      await requireProgression(req.userId)
      const zone = await userTimeZone(db, req.userId)
      const today = localDate(new Date(), zone)
      // One reroll a day: two at once must not both get one
      const result = await db.transaction().execute(async trx => {
        await lockUser(trx, req.userId)
        return reroll(trx, req.userId, req.params.id, today)
      })
      if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
      if (result === 'not-allowed') throw new ApiError(409, { error: 'this challenge cannot be rerolled' })
      return challengesView(db, req.userId, today, zone)
    },
  )

  done()
}
