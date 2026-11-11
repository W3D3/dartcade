import { test, expect } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// The Tournaments page shell (Tournaments, Tournaments-Phone boards): each tab's empty state for an
// admin, who has tournaments.enabled by default, and the dimmed nav item for a player without it.
for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  for (const tab of ['browse', 'mine', 'teams'] as const) {
    test(`tournaments: ${tab} ${name}`, async ({ browser }) => {
      const s = await open(browser, 'admin', view)
      await openHash(s.page, `/tournaments/${tab}`)
      await expect(s.page.getByRole('heading', { name: /yet/i })).toBeVisible()
      await shot(s.page, `tournaments/${tab}-${name}.png`)
    })
  }
}

test('tournaments: flag off desktop', async ({ browser }) => {
  const s = await open(browser, 'luke', VIEW.wide)
  await openHash(s.page, '/tournaments')
  await expect(s.page.getByText("Tournaments aren't available yet.")).toBeVisible()
  await shot(s.page, 'tournaments/flag-off-desktop.png')
})
