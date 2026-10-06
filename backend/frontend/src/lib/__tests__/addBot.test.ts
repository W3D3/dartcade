import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import AddBot from '../components/lobby/AddBot.svelte'

describe('AddBot', () => {
  it('shows an Add bot button', () => {
    const out = render(AddBot, { props: { onbot: () => Promise.resolve(true) } }).body
    expect(out).toContain('Add bot')
  })
})
