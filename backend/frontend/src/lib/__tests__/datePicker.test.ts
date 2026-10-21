import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import DatePicker from '../components/ui/date-picker/date-picker.svelte'

const html = (value: string) => render(DatePicker, { props: { value, onchange: () => undefined, label: 'From' } }).body

describe('DatePicker', () => {
  it('shows the date segments and a clear button for a set value', () => {
    const out = html('2026-10-05')
    expect(out).toContain('aria-label="From"')
    expect(out).toContain('Clear From')
    expect(out).toMatch(/2026/)
  })

  it('has no clear button when blank, and survives a malformed value', () => {
    expect(html('')).not.toContain('Clear From')
    expect(html('not-a-date')).not.toContain('Clear From')
  })
})
