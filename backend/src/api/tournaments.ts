// Tournaments (schema/api-v1.yaml, tag tournaments). Every route answers 404 while
// tournaments.enabled is off for the caller.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { listPublicTournaments, type BrowseRow } from '../db/tournaments.js'
import { requireTournamentsFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

const summary = (t: BrowseRow) => ({
  id: t.id,
  name: t.name,
  kind: t.kind,
  access: t.access,
  status: t.status,
  gameId: t.game_id,
  format: t.format,
  teamSize: t.team_size,
  maxEntries: t.max_entries,
  entries: t.entries,
  startsAt: t.starts_at?.toISOString() ?? null,
})

export function tournamentsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'listTournaments'>>('/api/tournaments', { preValidation: requireAuth, schema: fromSpec('listTournaments') }, async req => {
    await requireTournamentsFlag(db, req.userId)
    return { tournaments: (await listPublicTournaments(db)).map(summary) }
  })

  done()
}
