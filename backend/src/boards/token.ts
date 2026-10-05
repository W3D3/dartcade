import { createHash, randomBytes } from 'crypto'

/** What a board's bridge signs in with is stored only as this hash (boards.token_hash). */
export function hashBoardToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A new random bridge token, shown once, and the hash that is stored for it. */
export function newBoardToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashBoardToken(token) }
}
