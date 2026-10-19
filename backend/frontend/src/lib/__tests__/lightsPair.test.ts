import { describe, expect, it } from 'vitest'
import { brightnessPercent, confirmBlink, maxBriFromPercent, nextCandidate, startEdit, startPair } from '$lib/lights/pair'

const f = (mac: string, name = `WLED-${mac}`) => ({ mac, host: `192.168.1.${mac.length}`, name, leds: 144, version: '0.15.0', segments: 1 })
const found = [f('a'), f('bb', 'Shelf'), { ...f('ccc'), onBoard: 'Garage' }]

describe('pair flow', () => {
  it('starts at the blink check with the WLED name', () => {
    const s = startPair(found, 'bb', 'b1')
    expect(s).toMatchObject({ step: 'check', mac: 'bb', name: 'Shelf', segmentMode: 'whole', maxBri: 178 })
  })

  it('an unknown mac keeps that mac and has no name, never falling back to another device', () => {
    const s = startPair(found, 'zzz', 'b1')
    expect(s).toMatchObject({ step: 'check', mac: 'zzz', name: '' })
  })

  it('"show me another" skips devices paired elsewhere and wraps', () => {
    const s = nextCandidate(startPair(found, 'bb', 'b1'), found)
    expect(s.mac).toBe('a')
    expect(s.name).toBe('WLED-a')
  })

  it('a single eligible candidate stays on itself', () => {
    const one = [f('a'), { ...f('ccc'), onBoard: 'Garage' }]
    const s = nextCandidate(startPair(one, 'a', 'b1'), one)
    expect(s.mac).toBe('a')
  })

  it('starting from a device paired elsewhere picks the first eligible one', () => {
    const s = nextCandidate(startPair(found, 'ccc', 'b1'), found)
    expect(s.mac).toBe('a')
  })

  it('the current candidate disappearing with none left to offer clears it', () => {
    const remaining = [{ ...f('ccc'), onBoard: 'Garage' }]
    const s = nextCandidate(startPair(found, 'bb', 'b1'), remaining)
    expect(s.mac).toBeNull()
  })

  it('confirming the blink moves to the details', () => {
    expect(confirmBlink(startPair(found, 'a', 'b1')).step).toBe('details')
  })

  it('editing skips the blink check', () => {
    const s = startEdit(
      {
        id: 'd',
        mac: 'a',
        name: 'Ring',
        host: 'h',
        leds: 120,
        version: 'v',
        segments: 1,
        segmentMode: 'perSeat',
        maxBri: 255,
        reachable: true,
      },
      'b1',
    )
    expect(s).toMatchObject({ step: 'details', name: 'Ring', segmentMode: 'perSeat', maxBri: 255 })
  })

  it('brightness round-trips through percent', () => {
    expect(brightnessPercent(178)).toBe(70)
    expect(maxBriFromPercent(70)).toBe(178)
    expect(maxBriFromPercent(100)).toBe(255)
    expect(maxBriFromPercent(1)).toBe(2)
  })
})
