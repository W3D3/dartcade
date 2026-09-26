import type { FastifyInstance } from 'fastify'

const BOARD_URL = (process.env.DARTCADE_BOARD_URL ?? '').replace(/\/$/, '')

async function proxyAction(method: string, path: string, fallback?: string) {
  const tryFetch = (url: string) =>
    fetch(url, { method, headers: { 'Content-Length': '0' } })

  if (!BOARD_URL) throw Object.assign(new Error('no DARTCADE_BOARD_URL'), { code: 503 })

  const res = await tryFetch(BOARD_URL + path)
  if ((res.status === 404 || res.status === 405) && fallback) {
    return tryFetch(BOARD_URL + fallback)
  }
  return res
}

export async function boardApiPlugin(app: FastifyInstance) {
  const handle = (path: string, fallback?: string, method = 'PUT') =>
    async (_req: any, reply: any) => {
      try {
        const res = await proxyAction(method, path, fallback)
        return reply.code(res.ok ? 200 : res.status).send({ status: res.status })
      } catch (err: any) {
        return reply.code(err.code ?? 502).send({ error: err.message })
      }
    }

  app.post('/api/board/start',     handle('/api/start', '/api/detection/start'))
  app.post('/api/board/stop',      handle('/api/stop',  '/api/detection/stop'))
  app.post('/api/board/reset',     handle('/api/reset', undefined, 'POST'))
  app.post('/api/board/calibrate', handle('/api/config/calibration/auto?distortion=true', undefined, 'POST'))

  app.get('/api/board/status', async (_req, reply) => {
    try {
      if (!BOARD_URL) return reply.code(503).send({ error: 'no DARTCADE_BOARD_URL' })
      const res = await fetch(BOARD_URL + '/api/state')
      if (!res.ok) return reply.code(res.status).send({ error: 'board error' })
      const data = await res.json() as any
      return reply.send({
        status: data.status ?? null,
        running: data.running ?? false,
        event: data.event ?? null,
      })
    } catch {
      return reply.code(503).send({ error: 'board unreachable' })
    }
  })
}
