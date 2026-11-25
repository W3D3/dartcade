import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import NameStatusLine from '../components/NameStatusLine.svelte'
import type { NameStatus } from '../names.js'

const html = (status: NameStatus) => render(NameStatusLine, { props: { id: 'name-status', status } }).body

describe('NameStatusLine', () => {
  it('shows a free name as its handle, a taken one in red, and the rule while empty', () => {
    expect(html({ kind: 'available', name: 'sam.180', own: false })).toContain('@sam.180 is free')
    expect(html({ kind: 'taken', name: 'Luke' })).toMatch(/text-live-text[^>]*>(?:<!--[^>]*-->)*@Luke is taken/)
    expect(html({ kind: 'empty' })).toContain('2–20 letters, digits, . _ or -, no spaces')
  })

  it('turns a spinner next to "Checking…" while the name is being looked up', () => {
    expect(html({ kind: 'checking' })).toMatch(/<svg[^>]*animate-spin[\s\S]*Checking…/)
    expect(html({ kind: 'empty' })).not.toContain('<svg')
  })
})
