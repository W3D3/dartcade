import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import XpChip from '../components/progress/XpChip.svelte'

const gain = { lines: [{ kind: 'game' as const, amount: 25 }], total: 25, xpBefore: 0, xpAfter: 25, unlocks: [], challenges: [] }

describe('XpChip', () => {
  it('collapsed, its chevron points up, where the breakdown opens', () => {
    const html = render(XpChip, { props: { gain } }).body
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('lucide-chevron-up')
    expect(html).not.toContain('lucide-chevron-down')
    expect(html).not.toContain('id="xp-breakdown"')
  })
})
