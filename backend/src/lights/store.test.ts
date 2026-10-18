import { expect, it } from 'vitest'
import { LightsStore } from './store.js'

const d = (mac: string, host = '192.168.1.80') => ({ mac, host, name: 'WLED', leds: 144, version: '0.15.0', segments: 1 })

it('a scan replaces the list; a probe adds to it until the next scan', () => {
  const s = new LightsStore()
  s.setFound('b', [d('aa')], new Date(1))
  s.addProbe('b', '192.168.1.90', d('bb', '192.168.1.90'))
  expect(s.found('b').devices.map(x => x.mac)).toEqual(['aa', 'bb'])
  s.setFound('b', [d('cc')], new Date(2))
  expect(s.found('b').devices.map(x => x.mac)).toEqual(['cc'])
})

it('a failed probe is remembered for the page', () => {
  const s = new LightsStore()
  s.addProbe('b', '192.168.1.90', null, 'not a WLED device')
  expect(s.found('b').probe).toEqual({ host: '192.168.1.90', error: 'not a WLED device' })
})

it('status keeps when it last changed', () => {
  const s = new LightsStore()
  s.setStatus('b', 'd1', { reachable: false, error: 'timeout' })
  const since = s.status('b', 'd1')!.since
  s.setStatus('b', 'd1', { reachable: false, error: 'timeout' })
  expect(s.status('b', 'd1')!.since).toBe(since)
})

it('keeps a scan error until the next successful scan', () => {
  const s = new LightsStore()
  s.setFound('b', [], new Date(1), 'mdns browse failed')
  expect(s.found('b').scanError).toBe('mdns browse failed')
  s.setFound('b', [d('aa')], new Date(2))
  expect(s.found('b').scanError).toBeUndefined()
})
