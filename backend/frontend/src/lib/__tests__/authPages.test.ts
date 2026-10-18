import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import AuthPanel from '../components/AuthPanel.svelte'

describe('AuthPanel', () => {
  it('shows the board and headline when signing in', () => {
    const out = render(AuthPanel, { props: { variant: 'signin' } }).body
    expect(out).toContain('Step up to the oche.')
  })
  it('shows the 180 and the three steps when registering', () => {
    const out = render(AuthPanel, { props: { variant: 'register' } }).body
    expect(out).toContain('Three darts.')
    for (const s of ['Create your account', 'Connect your board', 'Pick a game and throw']) expect(out).toContain(s)
  })
})
