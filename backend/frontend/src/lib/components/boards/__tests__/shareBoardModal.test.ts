// ShareBoardModal: the owner's accepted friends as selectable rows. A friend not already shared
// is clickable (no disabled attribute); one already in alreadyShared is disabled.
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { Friend } from '$lib/api/lobby-ws'
import ShareBoardModal from '../ShareBoardModal.svelte'

const friend = (over: Partial<Friend>): Friend => ({
  id: 'u1',
  name: 'Alex',
  friendsSince: '2026-01-01T00:00:00.000Z',
  status: { kind: 'offline' },
  inYourLobby: false,
  invited: false,
  avatar: { kind: 'none' },
  ...over,
})

const noop = () => {}

describe('ShareBoardModal', () => {
  it('renders every accepted friend as a row', () => {
    const friends = [friend({}), friend({ id: 'u2', name: 'Sam' })]
    const html = render(ShareBoardModal, { props: { friends, alreadyShared: [], onshare: noop, onclose: noop } }).body
    expect(html).toContain('Alex')
    expect(html).toContain('Sam')
  })

  // The row button is the one with w-full in its class (the Close button in the modal header is
  // not), so this picks the friend row out from any other button on the page.
  const rowButtonAttrs = (html: string, name: string) =>
    new RegExp(`<button((?:(?!<button)[\\s\\S])*?w-full[\\s\\S]*?)>[\\s\\S]*?${name}`).exec(html)?.[1]

  it('a friend not already shared is a clickable (non-disabled) row', () => {
    const html = render(ShareBoardModal, { props: { friends: [friend({})], alreadyShared: [], onshare: noop, onclose: noop } }).body
    const attrs = rowButtonAttrs(html, 'Alex')
    expect(attrs).toBeDefined()
    expect(attrs).not.toMatch(/\sdisabled(=|\s|>|$)/)
  })

  it('a friend already in alreadyShared is disabled', () => {
    const html = render(ShareBoardModal, { props: { friends: [friend({})], alreadyShared: ['u1'], onshare: noop, onclose: noop } }).body
    const attrs = rowButtonAttrs(html, 'Alex')
    expect(attrs).toBeDefined()
    expect(attrs).toMatch(/\sdisabled(=|\s|>|$)/)
  })
})
