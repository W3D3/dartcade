// BoardCard's "shared by" tag: shown only on a board shared with the viewer (Board.sharedBy
// non-null), never on one the viewer owns.
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { Board } from '$lib/api'
import BoardCard from '../BoardCard.svelte'

const board: Board = {
  id: 'b1',
  name: 'Garage board',
  hardwareId: 'hw1',
  online: true,
  bridgeVersion: 'v0.4.2',
  bmVersion: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ip: '192.168.0.10',
  bmUrl: null,
  bridgeUpdate: { available: null, updatable: true },
  bigScreen: { mode: 'off', running: false, helper: false },
  sharedBy: null,
}

const noop = () => {}

describe('BoardCard: shared-by tag', () => {
  it('shows "Shared by {name}" when the board was shared with the viewer', () => {
    const html = render(BoardCard, { props: { board: { ...board, sharedBy: 'Alex' }, active: false, justPaired: false, onselect: noop } }).body
    expect(html).toContain('Shared by Alex')
  })

  it('renders no tag for a board the viewer owns', () => {
    const html = render(BoardCard, { props: { board, active: false, justPaired: false, onselect: noop } }).body
    expect(html).not.toContain('Shared by')
  })
})
