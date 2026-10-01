import { describe, it, expect, vi } from 'vitest'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import { SessionEngine, type EngineStore } from './engine.js'
import { x01Module } from '../games/x01.js'
import { atcModule } from '../games/atc.js'

// ajv-formats is CommonJS: under NodeNext, TypeScript types its default import as the
// module object, whose `default` is the plugin (at runtime module.exports.default is the
// plugin itself too).
const addFormats = addFormatsModule.default

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(wsSchema.$defs.Snapshot)

function engine() {
  const store: EngineStore = {
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getSessionEvents: vi.fn().mockResolvedValue([]),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    insertDarts: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    abortSession: vi.fn().mockResolvedValue(undefined),
  }
  return new SessionEngine(store, vi.fn())
}
const players = [{ name: 'Alice' }, { name: 'Bob' }]
const dart = (r: number) => ({ visit_id: 'v', index: 0, source_seq: 1,
  dart: { segment: { name: 'S20', number: 20, bed: 'SingleInner', multiplier: 1 }, score: 20, polar: { r, theta_deg: 90 } } })

async function play(e: SessionEngine, ...events: [string, unknown][]) {
  for (const [kind, data] of events) await e.onBridgeEvent('board-1', kind, data)
}

function expectValid(snap: unknown) {
  const ok = validate(snap)
  expect(ok, ajv.errorsText(validate.errors)).toBe(true)
}

describe('snapshots match schema/game-ws-v1.json', () => {
  it('ATC, fresh and mid-visit', async () => {
    const e = engine()
    const { sessionId } = await e.create('u1', 'board-1', 'atc', atcModule.defaultConfig, players)
    expectValid(e.getSnapshot(sessionId))
    await play(e, ['visit.opened', { visit_id: 'v' }], ['dart.detected', dart(0.3)])
    expectValid(e.getSnapshot(sessionId))
  })

  it('X01 without bull off, after a visit', async () => {
    const e = engine()
    const { sessionId } = await e.create('u1', 'board-1', 'x01', x01Module.defaultConfig, players)
    await play(e, ['visit.opened', { visit_id: 'v' }], ['dart.detected', dart(0.3)], ['takeout.finished', {}])
    expectValid(e.getSnapshot(sessionId))
  })

  it('X01 during and after a bull off', async () => {
    const e = engine()
    const { sessionId } = await e.create('u1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, players)
    expectValid(e.getSnapshot(sessionId))
    await play(e,
      ['visit.opened', { visit_id: 'a' }], ['dart.detected', dart(0.2)], ['takeout.finished', {}],
      ['visit.opened', { visit_id: 'b' }], ['dart.detected', dart(0.05)], ['takeout.finished', {}])
    const snap = e.getSnapshot(sessionId)!
    expect((snap.game as { bullOff: { result: unknown } }).bullOff.result).not.toBeNull()
    expectValid(snap)
  })
})
