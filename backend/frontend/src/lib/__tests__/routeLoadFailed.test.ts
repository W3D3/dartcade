import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

// RouteLoadFailed renders inside Layout for the nav to stay up, but Layout's own children
// (SideNav/NavRail/LobbyStrip/TabBar/SessionBanner, the friends drawer store) reach into
// svelte-spa-router for its `location` store and `push` in a way that, outside this project's
// configured Vite pipeline, hits a pre-existing Vitest/svelte-spa-router package-resolution gap
// ("No known conditions for '.' specifier") — no test has rendered anything inside the real
// Layout via `svelte/server` before this one. A passthrough fixture stands in for it so this test
// covers RouteLoadFailed's own markup without depending on that unrelated gap.
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))

const { default: RouteLoadFailed } = await import('../../routes/RouteLoadFailed.svelte')

describe('RouteLoadFailed', () => {
  it("shows a couldn't-load message and a reload button", () => {
    const out = render(RouteLoadFailed).body
    expect(out).toContain("Couldn't load this page.")
    expect(out).toContain('<button')
    expect(out).toContain('Reload')
  })
})
