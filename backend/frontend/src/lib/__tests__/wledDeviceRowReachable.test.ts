import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import WledDeviceRow from '../components/lights/WledDeviceRow.svelte'

const device = (reachable: boolean | null) => ({
  id: 'd1',
  mac: 'aa',
  name: 'Strip',
  host: '192.168.1.80',
  leds: 60,
  version: '0.15.0',
  segments: 1,
  segmentMode: 'whole' as const,
  maxBri: 178,
  reachable,
})

const row = (reachable: boolean | null) =>
  render(WledDeviceRow, {
    props: { device: device(reachable), now: new Date(), onblink: () => {}, onedit: () => {}, onremove: () => Promise.resolve() },
  }).body

describe('WledDeviceRow reachable dot', () => {
  it('is green and titled Reachable when true', () => {
    expect(row(true)).toMatch(/title="Reachable"[^>]*class="[^"]*bg-accent/)
  })

  it('is red and titled Not answering when false', () => {
    expect(row(false)).toMatch(/title="Not answering"[^>]*class="[^"]*bg-live/)
  })

  it('is a neutral dot titled Not checked yet when null (never sent to)', () => {
    const out = row(null)
    expect(out).toMatch(/title="Not checked yet"/)
    expect(out).not.toMatch(/title="Not checked yet"[^>]*class="[^"]*bg-accent/)
    expect(out).not.toMatch(/title="Not checked yet"[^>]*class="[^"]*bg-live/)
  })
})
