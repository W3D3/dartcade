import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

// See routeLoadFailed.test.ts: a passthrough fixture stands in for the real Layout (nav chain
// into svelte-spa-router) so this test covers RouteLoading's own markup.
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))

const { default: RouteLoading } = await import('../../routes/RouteLoading.svelte')

describe('RouteLoading', () => {
  it('holds a busy box for the page while its chunk downloads, the indicator after a short delay', () => {
    const out = render(RouteLoading).body
    expect(out).toContain('aria-busy="true"')
  })
})
