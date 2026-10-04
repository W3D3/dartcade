import { describe, it, expect, vi } from 'vitest'
import { readable } from 'svelte/store'
import { render } from 'svelte/server'
import StatusCard from '../components/friends/StatusCard.svelte'

// Forces the phone branch so StatusCard picks STATUS_COPY.phone's shorter wording (Friends-Phone.dc.html)
// instead of the desktop/tablet STATUS_COPY.page text statusControls.test.ts covers.
vi.mock('$lib/viewport', () => ({ isPhone: readable(true) }))
// Same SSR workaround as statusControls.test.ts / lobbyAccessPanel.test.ts.
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe('StatusCard on phones', () => {
  it('uses the shorter phone copy', () => {
    const online = render(StatusCard, { props: { invisible: false, onchange: () => null } }).body
    expect(online).toContain("Friends see that you're online and what you play.")

    const invisible = render(StatusCard, { props: { invisible: true, onchange: () => null } }).body
    expect(invisible).toContain('You appear offline. Your lobby still sees you.')
  })
})
