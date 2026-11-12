import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { preview } from '$lib/preview'
import AlphaBadge from '../components/feedback/AlphaBadge.svelte'

// A plain store instead of the one loading from the backend
vi.mock('$lib/preview', async () => ({ preview: (await import('svelte/store')).writable(null) }))

describe('AlphaBadge', () => {
  it('shows outside previews, as a plain badge that opens nothing', () => {
    preview.set(null)
    const { body } = render(AlphaBadge)
    expect(body).toContain('Alpha')
    expect(body).not.toContain('<button')
  })

  it('is hidden on a preview deployment', () => {
    preview.set({ pr: 145, url: 'https://github.com/W3D3/dartcade/pull/145' })
    expect(render(AlphaBadge).body).not.toContain('Alpha')
  })
})
