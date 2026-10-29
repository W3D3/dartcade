import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import GameCards from '../components/GameCards.svelte'

const cards = (props: { open: boolean; disabled?: boolean }) => render(GameCards, { props: { selected: 'x01', ...props } }).body

describe('GameCards', () => {
  it('shows coming-soon games as cards that cannot be picked', () => {
    const out = cards({ open: false })
    expect(out).toMatch(/aria-disabled="true"[^>]*aria-label="Bob's 27, coming soon/)
    expect(out).toMatch(/aria-disabled="false"[^>]*aria-label="X01:/)
  })

  it('drops the coming-soon games once a game is picked', () => {
    const out = cards({ open: true })
    expect(out).not.toContain("Bob's 27")
    expect(out).not.toContain('Practice')
    expect(out).toContain('aria-label="X01:')
  })

  it("can't pick anything when disabled (a member of someone else's lobby)", () => {
    expect(cards({ open: true, disabled: true })).toMatch(/aria-disabled="true"[^>]*aria-label="X01:/)
  })
})
