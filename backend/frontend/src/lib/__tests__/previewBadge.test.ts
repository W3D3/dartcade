import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { preview } from '$lib/preview'
import PreviewBadge from '../components/PreviewBadge.svelte'

// A plain store instead of the one loading from the backend
vi.mock('$lib/preview', async () => ({ preview: (await import('svelte/store')).writable(null) }))

describe('PreviewBadge', () => {
  it('links to the pull request in a new tab on a preview', () => {
    preview.set({ pr: 145, url: 'https://github.com/W3D3/dartcade/pull/145' })
    const out = render(PreviewBadge).body
    expect(out).toContain('href="https://github.com/W3D3/dartcade/pull/145"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('PR #145')
  })

  it('renders nothing in production', () => {
    preview.set(null)
    expect(render(PreviewBadge).body).not.toContain('<a')
  })
})
