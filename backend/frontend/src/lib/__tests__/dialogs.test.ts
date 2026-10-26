// Modal and the two drawers are bits-ui Dialogs: focus moves into the panel, Tab stays inside it,
// Escape closes the top one and focus goes back to what opened it. Rendered on the server here
// (no effects run), so this checks the panel is the bits-ui dialog, named for screen readers.
import { describe, it, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import { render } from 'svelte/server'
import ConfirmModal from '../components/ConfirmModal.svelte'
import SettingsDrawer from '../components/SettingsDrawer.svelte'
import FriendsDrawer from '../components/friends/FriendsDrawer.svelte'
import { defaultSettings } from '../gameSettings'

// The real store follows the router's location, which needs a window
vi.mock('../friends/drawer', () => ({ friendsDrawerOpen: writable(true) }))

const noop = () => {}
const dialogTag = (html: string) => html.match(/<div[^>]*role="dialog"[^>]*>/g) ?? []

describe('dialogs', () => {
  it.each([
    ['ConfirmModal', render(ConfirmModal, { props: { title: 'End game?', onconfirm: noop, oncancel: noop } }).body],
    [
      'SettingsDrawer',
      render(SettingsDrawer, { props: { settings: { ...defaultSettings }, gameId: 'x01', scoreBased: true, onclose: noop } }).body,
    ],
    ['FriendsDrawer', render(FriendsDrawer).body],
  ])('%s is one modal bits-ui dialog', (_, html) => {
    const tags = dialogTag(html)
    expect(tags).toHaveLength(1)
    expect(tags[0]).toContain('aria-modal="true"')
    expect(tags[0]).toContain('data-dialog-content')
  })

  it('the modal is named by its title', () => {
    const html = render(ConfirmModal, { props: { title: 'End game?', onconfirm: noop, oncancel: noop } }).body
    const id = dialogTag(html)[0]?.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(html).toMatch(new RegExp(`<h2 id="${id}"[^>]*>\\s*End game\\?`))
  })
})
