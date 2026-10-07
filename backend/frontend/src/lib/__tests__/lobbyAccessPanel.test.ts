import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import LobbyAccessPanel from '../components/lobby/LobbyAccessPanel.svelte'

// SegmentedControl's Tooltip option pulls in bits-ui's whole barrel (Select included), whose
// select-viewport.svelte crashes this toolchain's SSR CSS preprocessing outside the main pipeline
// (a pre-existing Vite 6 / @sveltejs/vite-plugin-svelte 5 issue, unrelated to this component).
// Stubbing it out sidesteps the crash; the tooltip branch isn't used here anyway.
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe('LobbyAccessPanel', () => {
  it('offers Friends and Private, with what the choice means', () => {
    const out = render(LobbyAccessPanel, { props: { access: 'invite', onchange: () => {} } }).body
    expect(out).toContain('Who can join')
    expect(out).toContain('Friends')
    expect(out).toContain('Private')
    expect(out).toContain('Only people you invite or give the code to.')
  })
})
