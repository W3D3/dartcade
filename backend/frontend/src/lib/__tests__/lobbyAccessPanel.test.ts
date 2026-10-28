import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import LobbyAccessPanel from '../components/lobby/LobbyAccessPanel.svelte'

describe('LobbyAccessPanel', () => {
  it('offers Friends and Private, with what the choice means', () => {
    const out = render(LobbyAccessPanel, { props: { access: 'invite', onchange: () => {} } }).body
    expect(out).toContain('Who can join')
    expect(out).toContain('Friends')
    expect(out).toContain('Private')
    expect(out).toContain('Only people you invite or give the code to.')
  })
})
