import type { Insertable, Kysely } from 'kysely'
import type { BoardsTable, Database, LobbiesTable, TournamentEntriesTable, TournamentsTable, UserTable } from '../db/schema.js'

type NewUser = Pick<UserTable, 'id'> & Partial<Insertable<UserTable>>

/** A user row named after its id (`ann` → name `ann`, `ann@example.com`); override whatever the test cares about. */
const userRow = ({ id, ...rest }: NewUser): Insertable<UserTable> => ({
  name: id,
  email: `${id}@example.com`,
  emailVerified: false,
  image: null,
  ...rest,
  id,
})

export async function insertUser(db: Kysely<Database>, user: string | NewUser): Promise<void> {
  await insertUsers(db, [user])
}

/** Several users in one insert; a bare string is just an id. */
export async function insertUsers(db: Kysely<Database>, users: (string | NewUser)[]): Promise<void> {
  await db
    .insertInto('user')
    .values(users.map(u => userRow(typeof u === 'string' ? { id: u } : u)))
    .execute()
}

type NewBoard = Pick<BoardsTable, 'id' | 'owner_user_id'> & Partial<Insertable<BoardsTable>>

export async function insertBoard(db: Kysely<Database>, { id, ...rest }: NewBoard): Promise<void> {
  await db
    .insertInto('boards')
    .values({ name: id, token_hash: `h-${id}`, ...rest, id })
    .execute()
}

type NewLobby = Pick<LobbiesTable, 'id' | 'host_user_id'> & Partial<Insertable<LobbiesTable>>

export async function insertLobby(db: Kysely<Database>, { id, ...rest }: NewLobby): Promise<void> {
  await db
    .insertInto('lobbies')
    .values({ name: `${id} lobby`, code: id.toUpperCase().padEnd(6, 'X').slice(0, 6), ...rest, id })
    .execute()
}

type NewTournament = Pick<TournamentsTable, 'id'> & Partial<Insertable<TournamentsTable>>

/** A public solo X01 single elimination of 8, a draft unless `status` says otherwise. */
export async function insertTournament(db: Kysely<Database>, { id, ...rest }: NewTournament): Promise<void> {
  await db
    .insertInto('tournaments')
    .values({
      kind: 'community',
      access: 'public',
      name: `${id} cup`,
      game_id: 'x01',
      game_config: JSON.stringify({ start: 501 }),
      format: 'single_elimination',
      team_size: 1,
      max_entries: 8,
      starts_at: null,
      ...rest,
      id,
    })
    .execute()
}

type NewEntry = Pick<TournamentEntriesTable, 'id' | 'tournament_id'> & Partial<Insertable<TournamentEntriesTable>>

export async function insertTournamentEntry(db: Kysely<Database>, { id, ...rest }: NewEntry): Promise<void> {
  await db
    .insertInto('tournament_entries')
    .values({ name: id, ...rest, id })
    .execute()
}
