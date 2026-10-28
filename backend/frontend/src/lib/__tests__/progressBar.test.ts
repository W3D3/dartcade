import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import Progress from '../components/ui/progress/progress.svelte'

describe('Progress', () => {
  it('is a labelled progressbar whose fill is the share of max', () => {
    const out = render(Progress, { props: { value: 3, max: 12, 'aria-label': 'Testing the hole' } }).body
    expect(out).toContain('role="progressbar"')
    expect(out).toContain('aria-label="Testing the hole"')
    expect(out).toContain('aria-valuenow="3"')
    expect(out).toContain('aria-valuemax="12"')
    expect(out).toContain('width: 25%')
  })
})
