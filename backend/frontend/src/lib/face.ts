import type { components } from '$lib/api/schema'

/** Whose picture to draw: a snapshot seat has this shape (guests and bots carry `{ kind: 'none' }`). */
export type Face = { avatar: components['schemas']['Avatar']; userId: string | null }

/** One seat of a match as its panels, rows and cards draw it. */
export type Who = { name: string; bot: { level: number } | null; face: Face | null }

const seatFace = (s: Face | undefined): Face | null => (s ? { avatar: s.avatar, userId: s.userId } : null)

/** The seats of a snapshot, in seat order. */
export const whoOf = (snapshot: { players: { name: string }[]; seats: (Face & { bot: { level: number } | null })[] }): Who[] =>
  snapshot.players.map((p, i) => ({ name: p.name, bot: snapshot.seats.at(i)?.bot ?? null, face: seatFace(snapshot.seats.at(i)) }))
