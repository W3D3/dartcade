// PendingBoardInvites: one row per incoming board-share invite with Accept/Decline; nothing at
// all when there are none (no nav badge, no empty state — visible only by opening the page).
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { IncomingBoardShare } from '$lib/boardShares'
import PendingBoardInvites from '../PendingBoardInvites.svelte'

const invite = (over: Partial<IncomingBoardShare>): IncomingBoardShare => ({
  id: 'inv1',
  boardId: 'b1',
  boardName: 'Garage board',
  ownerUserId: 'u1',
  ownerName: 'Alex',
  createdAt: '2026-10-26T00:00:00.000Z',
  ...over,
})

const noop = () => {}

describe('PendingBoardInvites', () => {
  it('renders one row per invite, naming the board and its owner, with both action buttons', () => {
    const invites = [invite({}), invite({ id: 'inv2', boardName: 'Office board', ownerName: 'Sam' })]
    const html = render(PendingBoardInvites, { props: { invites, onaccept: noop, ondecline: noop } }).body
    expect(html).toContain('Garage board')
    expect(html).toContain('Alex')
    expect(html).toContain('Office board')
    expect(html).toContain('Sam')
    expect((html.match(/>Accept</g) ?? []).length).toBe(2)
    expect((html.match(/>Decline</g) ?? []).length).toBe(2)
  })

  it('renders nothing with an empty list', () => {
    const html = render(PendingBoardInvites, { props: { invites: [], onaccept: noop, ondecline: noop } }).body
    expect(html.replace(/<!--.*?-->/gs, '').trim()).toBe('')
  })
})
