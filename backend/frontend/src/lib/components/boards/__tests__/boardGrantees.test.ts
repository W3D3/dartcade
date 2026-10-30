// BoardGrantees: the owner's "who has access" list for the selected board, one row per grantee
// with a Revoke button, plus a "Share this board" button that opens ShareBoardModal.
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { BoardGrantee } from '$lib/boardShares'
import BoardGrantees from '../BoardGrantees.svelte'

const grantee = (over: Partial<BoardGrantee>): BoardGrantee => ({
  id: 'share1',
  friendUserId: 'u2',
  friendName: 'Alex',
  status: 'accepted',
  createdAt: '2026-10-26T00:00:00.000Z',
  ...over,
})

const noop = () => {}

describe('BoardGrantees', () => {
  it('renders a row per grantee, naming them and their status, with a Revoke button each', () => {
    const grantees = [grantee({}), grantee({ id: 'share2', friendUserId: 'u3', friendName: 'Sam', status: 'pending' })]
    const html = render(BoardGrantees, { props: { grantees, onrevoke: noop, onshare: noop } }).body
    expect(html).toContain('Alex')
    expect(html).toContain('Sam')
    expect((html.match(/>Revoke</g) ?? []).length).toBe(2)
  })

  it('renders the Share this board button wired to onshare, even with no grantees yet', () => {
    const html = render(BoardGrantees, { props: { grantees: [], onrevoke: noop, onshare: noop } }).body
    expect(html).toContain('Share this board')
    const attrs = /<button([^>]*)>[\s\S]*?Share this board/.exec(html)?.[1]
    expect(attrs).toBeDefined()
    expect(attrs).not.toMatch(/\sdisabled(=|\s|>|$)/)
  })
})
