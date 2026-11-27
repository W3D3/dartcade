import { sql } from 'kysely'
import { UNCOUNTED } from '../shared/gameNames.js'

/**
 * A finished game counts for stats, records, form, XP, challenges and achievements: a moderator
 * hasn't invalidated it, nobody played with a handicap and it is no practice mode (UNCOUNTED: missions
 * pay their own XP, see missions/service.ts; Dungeon pays none). Every kind still shows in history.
 * `alias` names the game_sessions table in the query.
 */
export const gameCounts = (alias: string) =>
  sql<boolean>`(${sql.ref(`${alias}.invalidated_at`)} IS NULL AND NOT (${sql.ref(`${alias}.config`)} ? 'handicaps') AND ${sql.ref(`${alias}.game_id`)} NOT IN (${sql.join([...UNCOUNTED])}))`
