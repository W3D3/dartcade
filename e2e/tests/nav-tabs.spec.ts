import { test, expect } from '../fixtures/auth.js'

// Play's tabs (New game, Ranked, Missions) and Stats' (Overview, History) are routes of their own,
// and the old Matchmaking and History addresses land on them. Admins have every flag on.

test('Play: each tab is its own route, the side nav keeps Play active', async ({ adminPage: page }) => {
  await page.goto('/#/play')
  const tabs = page.getByRole('navigation', { name: 'Play' })
  await expect(tabs.getByRole('link', { name: 'New game' })).toHaveAttribute('aria-current', 'page')

  await tabs.getByRole('link', { name: 'Ranked' }).click()
  await expect(page).toHaveURL(/#\/play\/ranked$/)
  await expect(tabs.getByRole('link', { name: 'Ranked' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: /Find match/i })).toBeVisible()

  await tabs.getByRole('link', { name: 'Missions' }).click()
  await expect(page).toHaveURL(/#\/play\/missions$/)
  await expect(tabs.getByRole('link', { name: 'Missions' })).toHaveAttribute('aria-current', 'page')

  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Play' }).getByRole('link', { name: 'Missions' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.goBack()
  await expect(page).toHaveURL(/#\/play\/ranked$/)
})

test('Stats: Overview and History tabs; no Matchmaking or History in the nav', async ({ adminPage: page }) => {
  await page.goto('/#/stats')
  const tabs = page.getByRole('navigation', { name: 'Stats' })
  await expect(tabs.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  await tabs.getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveURL(/#\/stats\/history$/)
  await expect(page.getByRole('region', { name: 'Matches' })).toBeVisible()

  const main = page.getByRole('navigation', { name: 'Main' }).locator('visible=true')
  await expect(main.getByRole('link', { name: 'Stats', exact: true })).toHaveAttribute('aria-current', 'page')
  for (const gone of ['Matchmaking', 'Ranked', 'History']) await expect(main.getByRole('link', { name: gone, exact: true })).toHaveCount(0)
})

test('the old addresses land on their tabs, query kept', async ({ adminPage: page }) => {
  for (const [old, now] of [
    ['/history?mode=x01', /#\/stats\/history\?mode=x01$/],
    ['/matchmaking', /#\/play\/ranked$/],
    ['/matchmaking/ranks', /#\/play\/ranked\/ranks$/],
  ] as const) {
    await page.goto(`/#${old}`)
    await expect(page).toHaveURL(now)
  }
})
