import { describe, expect, it } from 'vitest'
import { BridgeUpdates } from './bridgeUpdate.js'

describe('BridgeUpdates', () => {
  it('follows an update from the request to the hello with the new version', () => {
    const u = new BridgeUpdates()
    expect(u.get('b1')).toBeNull()
    u.request('b1', 'v0.9.2')
    expect(u.inFlight('b1')).toBe(true)
    u.report('b1', { version: 'v0.9.2', phase: 'downloading' })
    u.hello('b1', 'v0.9.0') // the socket reconnected mid-download
    expect(u.get('b1')?.phase).toBe('downloading')
    u.report('b1', { version: 'v0.9.2', phase: 'restarting' })
    u.hello('b1', 'v0.9.2')
    expect(u.get('b1')).toEqual({ version: 'v0.9.2', phase: 'done', error: null })
    expect(u.inFlight('b1')).toBe(false)
  })

  it('fails when the bridge restarts on the old version', () => {
    const u = new BridgeUpdates()
    u.request('b1', 'v0.9.2')
    u.report('b1', { version: 'v0.9.2', phase: 'restarting' })
    u.hello('b1', 'v0.9.0')
    expect(u.get('b1')).toEqual({ version: 'v0.9.2', phase: 'failed', error: 'The bridge restarted on v0.9.0' })
  })

  it('keeps the error the bridge reports', () => {
    const u = new BridgeUpdates()
    u.request('b1', 'v0.9.2')
    u.report('b1', { version: 'v0.9.2', phase: 'failed', error: 'checksum mismatch' })
    expect(u.get('b1')).toEqual({ version: 'v0.9.2', phase: 'failed', error: 'checksum mismatch' })
    expect(u.inFlight('b1')).toBe(false)
  })

  it('gives up on a bridge that stops answering', () => {
    let t = 0
    const u = new BridgeUpdates(() => t)
    u.request('b1', 'v0.9.2')
    t = 10 * 60 * 1000
    expect(u.inFlight('b1')).toBe(true)
    t = 12 * 60 * 1000 + 1
    expect(u.get('b1')?.phase).toBe('failed')
    expect(u.inFlight('b1')).toBe(false)
  })
})
