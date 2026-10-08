import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

// See routeLoadFailed.test.ts: a passthrough fixture stands in for the real Layout (nav chain
// into svelte-spa-router) so this test covers RouteLoading's own markup.
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))

const { default: RouteLoading } = await import('../../routes/RouteLoading.svelte')

describe('RouteLoading', () => {
  it('shows the same loading line GameDetails uses for its own data fetch', () => {
    const out = render(RouteLoading).body
    expect(out).toContain('Loading the game…')
  })
})
