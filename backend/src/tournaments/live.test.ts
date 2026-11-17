import { describe, expect, it } from 'vitest'
import type { WebSocket } from 'ws'
import { TournamentLive } from './live.js'

const fakeWs = () => {
  const sent: string[] = []
  const ws = { OPEN: 1, readyState: 1, send: (s: string) => sent.push(s) }
  return { ws: ws as unknown as WebSocket, sent, close: () => (ws.readyState = 3) }
}

describe('TournamentLive.add racing a socket that closes', () => {
  it('does not keep a device whose socket closed while its state was built', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const live = new TournamentLive(async () => {
      await gate
      return { type: 'tournament.state', matches: [] } as never
    })
    const device = fakeWs()
    const organizer = fakeWs()
    const adding = live.add('t1', device.ws, { organizer: true, device: { id: 'd1', name: 'Board 1' } })
    // The device's socket drops while the state is being built: onceGone runs remove first
    device.close()
    live.remove('t1', device.ws)
    release()
    await adding
    await live.add('t1', organizer.ws, { organizer: true })
    const devices = organizer.sent
      .map(s => JSON.parse(s) as { type: string; devices?: unknown[] })
      .find(m => m.type === 'tournament.devices')
    expect(devices?.devices).toEqual([])
  })
})
