import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import type { Board } from '$lib/api'
import LightsBoardPicker from '../components/lights/LightsBoardPicker.svelte'

const board = (id: string, online = true): Board => ({
  id,
  name: `Board ${id}`,
  hardwareId: null,
  online,
  bridgeVersion: null,
  bmVersion: null,
  createdAt: '2026-01-01T00:00:00Z',
  ip: null,
  bmUrl: null,
  bridgeUpdate: { available: null, updatable: false },
})

describe('LightsBoardPicker device counts', () => {
  it("shows an em dash, not '0 devices', for a board whose lights haven't loaded yet", () => {
    const html = render(LightsBoardPicker, {
      props: { boards: [board('a')], selectedId: 'a', deviceCounts: {}, onselect: () => {} },
    }).body
    expect(html).toContain('—')
    expect(html).not.toContain('0 devices')
  })

  it('shows the real count once it has loaded, including a failed board staying at its last known count', () => {
    const html = render(LightsBoardPicker, {
      props: { boards: [board('a'), board('b')], selectedId: 'a', deviceCounts: { a: 0, b: 3 }, onselect: () => {} },
    }).body
    expect(html).toContain('0 devices')
    expect(html).toContain('3 devices')
  })

  it('shows offline for an unreachable board regardless of any stale count', () => {
    const html = render(LightsBoardPicker, {
      props: { boards: [board('a', false)], selectedId: 'a', deviceCounts: { a: 2 }, onselect: () => {} },
    }).body
    expect(html).toContain('offline')
    expect(html).not.toContain('2 devices')
  })
})
