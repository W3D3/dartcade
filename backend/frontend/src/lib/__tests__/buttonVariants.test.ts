import { describe, it, expect } from 'vitest'
import { buttonVariants } from '../components/ui/button/button-variants.js'

describe('buttonVariants', () => {
  it('every button has the hand cursor', () => {
    for (const variant of ['primary', 'outline', 'destructive', 'quiet'] as const) {
      expect(buttonVariants({ variant })).toContain('cursor-pointer')
    }
  })

  it('a quiet icon-sm button is a 32px square without a border', () => {
    const cls = buttonVariants({ variant: 'quiet', size: 'icon-sm' })
    expect(cls).toContain('size-8')
    expect(cls).not.toMatch(/\bh-10\b/)
    expect(cls).toContain('border-0')
  })
})
