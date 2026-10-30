// Board-share invites: an owner invites an accepted friend to use their board, the friend accepts
// or declines. Once accepted, the grantee can pick the board for a session or lobby seat (Task 3)
// and flip its lights master switch (Task 4); device management and owner-only controls stay out.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { findOwnBoard } from '../boards/own.js'
import { areFriends } from '../db/friends.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import {
  insertBoardShareInvite,
  getBoardShare,
  acceptBoardShare,
  deleteBoardShare,
  granteesOfBoard,
  incomingSharesFor,
  type BoardGrantee,
  type BoardShareRow,
} from '../db/boardShares.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

type Replier = { code(n: number): { send(b: { error: string }): unknown } }

const granteeView = (g: BoardGrantee) => ({
  id: g.id,
  friendUserId: g.friendUserId,
  friendName: g.friendName,
  status: g.status,
  createdAt: g.createdAt.toISOString(),
})

export function boardSharesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  /** The board if it exists and belongs to the user; otherwise sends 404/403 and returns null. */
  async function ownBoard(id: string, userId: string, reply: Replier) {
    const own = await findOwnBoard(db, id, userId)
    if ('board' in own) return own.board
    if (own.problem === 'not_found') reply.code(404).send({ error: 'not found' })
    else reply.code(403).send({ error: 'forbidden' })
    return null
  }

  app.get<Route<'listBoardShares'>>(
    '/api/boards/:id/shares',
    { preValidation: requireAuth, schema: fromSpec('listBoardShares') },
    async (req, reply) => {
      const board = await ownBoard(req.params.id, req.userId, reply)
      if (!board) return reply
      return reply.send({ shares: (await granteesOfBoard(db, board.id)).map(granteeView) })
    },
  )

  app.post<Route<'shareBoard'>>(
    '/api/boards/:id/shares',
    { preValidation: requireAuth, schema: fromSpec('shareBoard') },
    async (req, reply) => {
      const board = await ownBoard(req.params.id, req.userId, reply)
      if (!board) return reply
      const { friendUserId } = req.body
      if (!(await areFriends(db, req.userId, friendUserId))) return reply.code(400).send({ error: 'not an accepted friend' })
      let row: BoardShareRow
      try {
        row = await insertBoardShareInvite(db, board.id, friendUserId)
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) return reply.code(409).send({ error: 'already shared with this friend' })
        throw err
      }
      const grantee = (await granteesOfBoard(db, board.id)).find(g => g.id === row.id)
      if (!grantee) throw new Error('board share invite vanished right after it was inserted')
      return reply.code(201).send(granteeView(grantee))
    },
  )

  app.delete<Route<'revokeBoardShare'>>(
    '/api/boards/:id/shares/:shareId',
    { preValidation: requireAuth, schema: fromSpec('revokeBoardShare') },
    async (req, reply) => {
      const board = await ownBoard(req.params.id, req.userId, reply)
      if (!board) return reply
      const share = await getBoardShare(db, req.params.shareId)
      if (!share || share.board_id !== board.id) return reply.code(404).send({ error: 'not found' })
      await deleteBoardShare(db, share.id)
      return reply.code(204).send()
    },
  )

  app.get<Route<'listIncomingBoardShares'>>(
    '/api/board-shares/incoming',
    { preValidation: requireAuth, schema: fromSpec('listIncomingBoardShares') },
    async req => ({
      shares: (await incomingSharesFor(db, req.userId)).map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    }),
  )

  /** The invite the signed-in user may accept or decline: addressed to them, still pending. */
  async function ownPendingInvite(id: string, userId: string): Promise<BoardShareRow | undefined> {
    const share = await getBoardShare(db, id)
    return share && share.friend_user_id === userId && share.status === 'pending' ? share : undefined
  }

  app.post<Route<'acceptBoardShare'>>(
    '/api/board-shares/:id/accept',
    { preValidation: requireAuth, schema: fromSpec('acceptBoardShare') },
    async (req, reply) => {
      const share = await ownPendingInvite(req.params.id, req.userId)
      if (!share) return reply.code(404).send({ error: 'not found' })
      await acceptBoardShare(db, share.id, new Date())
      return reply.code(204).send()
    },
  )

  app.post<Route<'declineBoardShare'>>(
    '/api/board-shares/:id/decline',
    { preValidation: requireAuth, schema: fromSpec('declineBoardShare') },
    async (req, reply) => {
      const share = await ownPendingInvite(req.params.id, req.userId)
      if (!share) return reply.code(404).send({ error: 'not found' })
      await deleteBoardShare(db, share.id)
      return reply.code(204).send()
    },
  )

  done()
}
