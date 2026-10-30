import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import BoardCard from '../components/boards/BoardCard.svelte'

const board = {
  id: 'b1',
  name: 'Board One',
  hardwareId: null,
  online: true,
  bridgeVersion: null,
  bmVersion: null,
  createdAt: new Date().toISOString(),
  ip: null,
  bmUrl: null,
  bridgeUpdate: { available: null, updatable: false },
  bigScreen: { mode: 'off' as const, running: false, helper: false },
  autoStart: true,
}

const card = (lights?: number) => render(BoardCard, { props: { board, active: false, justPaired: false, onselect: () => {}, lights } }).body
const lightsStat = (out: string) => out.match(/<dt[^>]*>Lights<\/dt>\s*<dd[^>]*>([^<]*)<\/dd>/)?.[1]

describe('BoardCard lights stat', () => {
  it('shows the device count', () => {
    expect(lightsStat(card(2))).toBe('2 devices')
    expect(lightsStat(card(1))).toBe('1 device')
  })

  it('shows a dash when there are none', () => {
    expect(lightsStat(card(0))).toBe('—')
  })

  it('shows no lights stat when the count is unknown (flag off or not loaded)', () => {
    expect(card(undefined)).not.toContain('Lights')
  })

  it('is one button with no links in it (no nested interactive elements)', () => {
    for (const out of [card(2), card(0), card(undefined)]) {
      expect(out.match(/<button\b/g)).toHaveLength(1)
      expect(out).not.toMatch(/<a\b/)
    }
  })
})
