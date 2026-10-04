import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import type { FriendsService } from '../friends/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { friends: FriendsService }

/** Friends and friend requests. The service throws a FriendError for anything it refuses. */
export function friendsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { friends } = opts
  const auth = { preValidation: requireAuth }

  app.get<Route<'listFriends'>>('/api/friends', { ...auth, schema: fromSpec('listFriends') }, async (req) => friends.list(req.userId))

  app.post<Route<'sendFriendRequest'>>('/api/friends/requests', { ...auth, schema: fromSpec('sendFriendRequest') }, async (req, reply) => {
    const r = await friends.request(req.userId, req.body.name)
    return reply.code(r.status === 'accepted' ? 200 : 201).send(r)
  })

  app.post<Route<'acceptFriendRequest'>>('/api/friends/requests/:id/accept', { ...auth, schema: fromSpec('acceptFriendRequest') }, async (req, reply) => {
    await friends.accept(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.post<Route<'declineFriendRequest'>>('/api/friends/requests/:id/decline', { ...auth, schema: fromSpec('declineFriendRequest') }, async (req, reply) => {
    await friends.decline(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.delete<Route<'cancelFriendRequest'>>('/api/friends/requests/:id', { ...auth, schema: fromSpec('cancelFriendRequest') }, async (req, reply) => {
    await friends.cancel(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.delete<Route<'removeFriend'>>('/api/friends/:userId', { ...auth, schema: fromSpec('removeFriend') }, async (req, reply) => {
    await friends.remove(req.userId, req.params.userId)
    return reply.code(204).send()
  })

  done()
}
