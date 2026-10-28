import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import DateRangePicker from '../components/ui/date-picker/date-range-picker.svelte'

const html = (from: string, to: string) => render(DateRangePicker, { props: { from, to, onchange: () => undefined, label: 'Dates' } }).body

describe('DateRangePicker', () => {
  it('names both ends and offers a clear button once either is set', () => {
    const out = html('2026-10-05', '')
    expect(out).toContain('aria-label="Dates start"')
    expect(out).toContain('aria-label="Dates end"')
    expect(out).toContain('Clear Dates')
    expect(out).toMatch(/2026/)
  })

  it('has no clear button when blank, and survives malformed ends', () => {
    expect(html('', '')).not.toContain('Clear Dates')
    expect(html('nope', 'also-nope')).not.toContain('Clear Dates')
  })
})
