import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const location = { hash: '' }

async function bestWith(status: number, body: unknown) {
  vi.stubGlobal('window', { location })
  // Node's Request wants an absolute URL; the app's client sends relative ones
  const NodeRequest = Request
  vi.stubGlobal(
    'Request',
    class extends NodeRequest {
      constructor(url: string | Request, init?: RequestInit) {
        super(typeof url === 'string' ? new URL(url, 'http://localhost') : url, init)
      }
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))),
  )
  vi.resetModules()
  const { bestStat } = await import('../p121/best.js')
  const store = bestStat('p121', 'highestMade')
  let value: unknown = 'unset'
  const unsub = store.subscribe(v => (value = v))
  await store.refresh()
  await new Promise(r => setTimeout(r, 0))
  unsub()
  return value
}

describe('bestStat', () => {
  it('is the signed-in viewer’s best', async () => {
    expect(await bestWith(200, { best: { value: 122, finishedAt: '2026-10-01T10:00:00Z' } })).toEqual({
      value: 122,
      finishedAt: '2026-10-01T10:00:00Z',
    })
  })

  it('is none for a signed-out viewer (a kiosk), and does not send them to the sign-in page', async () => {
    location.hash = ''
    expect(await bestWith(401, { error: 'unauthorized' })).toBeNull()
    expect(location.hash).toBe('')
  })
})
