import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets.js'
import { checkWledState, MAX_RAW_BYTES, WLED_SEG_KEYS, WLED_STATE_KEYS } from './wledState.js'

describe('checkWledState', () => {
  it('lists the same keys as the bridge, through schema/wled-state-allowlist.json', () => {
    const file = JSON.parse(readFileSync(new URL('../../../../schema/wled-state-allowlist.json', import.meta.url), 'utf8'))
    expect(Object.keys(WLED_STATE_KEYS).sort()).toEqual([...file.state].sort())
    expect(Object.keys(WLED_SEG_KEYS).sort()).toEqual([...file.seg].sort())
  })

  it("passes every one of Dartcade's own preset states", () => {
    for (const [name, state] of Object.entries(PRESETS)) expect(checkWledState(state), name).toMatchObject({ ok: true })
  })

  it('passes a colour, an effect and a strip preset', () => {
    expect(
      checkWledState({
        on: true,
        bri: 128,
        transition: 7,
        seg: [
          {
            id: 0,
            fx: 42,
            sx: 160,
            col: [
              [255, 155, 69],
              [0, 0, 0, 0],
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
    })
    expect(checkWledState({ ps: 3 })).toMatchObject({ ok: true })
  })

  it('refuses what would change the strip beyond its light: saving or deleting presets, a reboot, sync, a playlist editor', () => {
    expect(checkWledState({ on: true, psave: 3, pdel: 2, rb: true, udpn: { send: true }, playlist: {} })).toEqual({
      ok: false,
      problems: ['psave is not allowed', 'pdel is not allowed', 'rb is not allowed', 'udpn is not allowed', 'playlist is not allowed'],
    })
    expect(checkWledState({ seg: [{ id: 0, nonsense: 1 }] })).toEqual({ ok: false, problems: ['seg[0].nonsense is not allowed'] })
  })

  it('refuses values out of range or of the wrong kind', () => {
    const r = checkWledState({ on: 'yes', bri: 300, ps: 251, seg: [{ id: 0, col: [[256, 0, 0]], n: 'x'.repeat(33) }, 4] })
    expect(r).toEqual({
      ok: false,
      problems: [
        'on must be true or false',
        'bri must be a whole number from 0 to 255',
        'ps must be a whole number from -1 to 250',
        'seg[0].col must be up to three [r, g, b] colours from 0 to 255',
        'seg[0].n must be text of at most 32 characters',
        'seg[1] must be an object',
      ],
    })
  })

  it('refuses something that is no object, an empty one and one too long', () => {
    expect(checkWledState([1])).toMatchObject({ ok: false })
    expect(checkWledState({})).toEqual({ ok: false, problems: ['The state is empty'] })
    const long = {
      seg: Array.from({ length: 30 }, (_, id) => ({
        id,
        n: 'x'.repeat(32),
        col: [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
      })),
    }
    expect(JSON.stringify(long).length).toBeGreaterThan(MAX_RAW_BYTES)
    expect(checkWledState(long)).toEqual({ ok: false, problems: [`The state is longer than ${MAX_RAW_BYTES} characters`] })
  })
})
