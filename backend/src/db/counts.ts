import { sql } from 'kysely'

/**
 * A finished game counts for stats, records, form, XP, challenges and achievements: a moderator
 * hasn't invalidated it and nobody played with a handicap. Either kind still shows in history.
 * `alias` names the game_sessions table in the query.
 */
export const gameCounts = (alias: string) =>
  sql<boolean>`(${sql.ref(`${alias}.invalidated_at`)} IS NULL AND NOT (${sql.ref(`${alias}.config`)} ? 'handicaps'))`
