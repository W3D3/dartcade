import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import Breadcrumb from '../components/ui/breadcrumb/breadcrumb.svelte'

describe('Breadcrumb', () => {
  it('renders a nav landmark, a link per step but the last, and the current page as a span', () => {
    const out = render(Breadcrumb, { props: { items: [{ label: 'Admin', href: '#/admin' }, { label: 'Users' }] } }).body
    expect(out).toContain('aria-label="Breadcrumb"')
    expect(out).toMatch(/<a href="#\/admin"[^>]*>Admin<\/a>/)
    expect(out).toMatch(/<span aria-current="page"[^>]*>Users<\/span>/)
    // The current page is never a link, even once there's an href on it too
    expect(out).not.toMatch(/<a[^>]*>Users<\/a>/)
  })

  it('separates steps with a presentational, hidden separator', () => {
    const out = render(Breadcrumb, { props: { items: [{ label: 'Admin', href: '#/admin' }, { label: 'Users' }] } }).body
    expect(out).toMatch(/<li role="presentation" aria-hidden="true"/)
  })

  it('renders a single-item trail as just the current page, no separator', () => {
    const out = render(Breadcrumb, { props: { items: [{ label: 'Admin' }] } }).body
    expect(out).toMatch(/<span aria-current="page"[^>]*>Admin<\/span>/)
    expect(out).not.toContain('role="presentation"')
  })
})
