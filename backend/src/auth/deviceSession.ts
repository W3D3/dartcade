// A venue device's session (tournament mode): a random token in an httpOnly cookie, stored only as
// a hash (db/tournamentDevices.ts). It is not a login. requireAuth and the sockets treat it as the
// organizer who paired it, but only on routes that declare `config: { tournamentDevice: true }`
// (or sockets that opt in) and only for its own tournament; everything else refuses it.
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/index.js'
import { deviceByToken, SESSION_MS, type DeviceSession } from '../db/tournamentDevices.js'

export const DEVICE_COOKIE = 'dartcade_tournament_device'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set when the request is a venue device's session, not a signed-in user. */
    tournamentDevice?: DeviceSession
    /** requireAuth refused a venue device here: a refusal no route documents, so the response check skips it. */
    deviceRefused?: boolean
  }
  interface FastifyContextConfig {
    /** The route may be called by a venue device (of the tournament in `:id`, when it has one). */
    tournamentDevice?: boolean
  }
}

export function deviceToken(req: Pick<FastifyRequest, 'headers'>): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === DEVICE_COOKIE && value.length > 0) return value.join('=')
  }
  return null
}

export async function getDeviceSession(req: Pick<FastifyRequest, 'headers'>): Promise<DeviceSession | null> {
  const token = deviceToken(req)
  return token === null ? null : deviceByToken(db, token, new Date())
}

const secure = () => ((process.env.BETTER_AUTH_URL ?? '').startsWith('https:') ? '; Secure' : '')

export function setDeviceCookie(reply: FastifyReply, token: string): void {
  void reply.header(
    'set-cookie',
    `${DEVICE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure()}`,
  )
}

export function clearDeviceCookie(reply: FastifyReply): void {
  void reply.header('set-cookie', `${DEVICE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`)
}
