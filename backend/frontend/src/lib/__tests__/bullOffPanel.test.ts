import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { ComponentProps } from 'svelte'
import BullOffPanel from '../components/BullOffPanel.svelte'

const bullOff = {
  throws: [{ mm: 20 }, null],
  sequence: [0, 1],
  currentPlayer: 1,
  result: null,
} as unknown as ComponentProps<typeof BullOffPanel>['bullOff']
const html = (canThrow: boolean) =>
  render(BullOffPanel, { props: { players: [{ name: 'Ann' }, { name: 'Bob' }], bullOff, manual: true, canThrow, send: () => undefined } })
    .body

describe('BullOffPanel', () => {
  it("gives Undo, Next and Skip to the thrower's controller", () => {
    const out = html(true)
    for (const label of ['Undo', 'Next', 'Skip']) expect(out).toContain(`>${label}<`)
  })

  it('shows the other player the status only: their Undo, Next and Skip would be refused', () => {
    const out = html(false)
    for (const label of ['Undo', 'Next', 'Skip']) expect(out).not.toContain(`>${label}<`)
    expect(out).toContain('To beat')
  })
})
