import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { VIEW, closeToasts, open, shot } from './helpers.js'
import type { View } from './helpers.js'

// Friend search (the Friends-Search boards). The seed's friends are Luke and Phil; the server's answers
// are mocked so each state is the same every run. The search API's own rules are covered by its tests.
const hit = (name: string, request: string, mutualFriends: number) => ({
  id: `u-${name}`,
  name,
  request,
  mutualFriends,
  avatar: { kind: 'none' },
})
const PEOPLE = [hit('Lukas', 'none', 3), hit('Lukasz', 'received', 1), hit('Luka', 'sent', 1), hit('Lucia', 'friends', 4)]
const SUGGESTIONS = [hit('Mara', 'none', 3), hit('Jonas', 'none', 2), hit('Elin', 'none', 2)]
const json = (users: object[]) => (route: Route) => route.fulfill({ json: { users } })

const VIEWS: [string, View][] = [
  ['desktop', VIEW.desktop],
  ['phone', VIEW.phone],
]

async function ready(page: Page, suggestions = SUGGESTIONS) {
  await page.route('**/api/friends/suggestions', json(suggestions))
  await page.goto('/#/friends')
  await expect(page.getByText('Luke', { exact: true }).first()).toBeVisible()
  await closeToasts(page)
  return page.getByRole('combobox', { name: 'Search friends or find people' })
}

for (const [name, view] of VIEWS) {
  test(`friend search states, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const field = await ready(page)
    const options = page.getByRole('option')

    // Focused and empty: the rule, and people you may know
    await field.click()
    await expect(page.getByText('People you may know')).toBeVisible()
    await shot(page, `friend-search/empty-${name}.png`)

    // Typing: your friends first, then people on Dartcade, the first row highlighted
    await page.route('**/api/friends/search*', json(PEOPLE))
    await field.fill('luk')
    await expect(page.getByText('Request sent')).toBeVisible()
    await field.press('ArrowDown')
    await expect(options.filter({ hasText: 'Lukas' }).first()).toHaveAttribute('data-highlighted', '')
    await shot(page, `friend-search/results-${name}.png`)

    // Too short: friends answer, the hint says what is missing
    await field.fill('lu')
    await expect(page.getByText('Type 1 more letter')).toBeVisible()
    await shot(page, `friend-search/short-${name}.png`)

    // Waiting for the server: friends stay, skeleton rows below
    await page.unroute('**/api/friends/search*')
    await page.route('**/api/friends/search*', () => new Promise(() => undefined))
    await field.fill('luk')
    await expect(page.getByRole('group', { name: 'People on Dartcade' })).toBeVisible()
    await shot(page, `friend-search/loading-${name}.png`)

    // Nothing found
    await page.unroute('**/api/friends/search*')
    await page.route('**/api/friends/search*', json([]))
    await field.fill('zzq')
    await expect(page.getByText('No players found for “zzq”')).toBeVisible()
    await shot(page, `friend-search/none-${name}.png`)

    // Error, with Retry; friends stay in view
    await page.unroute('**/api/friends/search*')
    await page.route('**/api/friends/search*', route => route.fulfill({ status: 500, json: { error: 'boom' } }))
    await field.fill('luke')
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await shot(page, `friend-search/error-${name}.png`)

    // Rate limited
    await page.unroute('**/api/friends/search*')
    await page.route('**/api/friends/search*', route => route.fulfill({ status: 429, json: { error: 'slow down' } }))
    await field.fill('lukas')
    await expect(page.getByText('Slow down a little')).toBeVisible()
    await shot(page, `friend-search/limited-${name}.png`)

    // Add: the row flips at once, a toast offers Undo
    await page.unroute('**/api/friends/search*')
    await page.route('**/api/friends/search*', json(PEOPLE))
    await page.route('**/api/friends/requests', route => route.fulfill({ status: 201, json: { id: 'r-1', status: 'pending' } }))
    await field.fill('luk')
    await page.getByRole('option', { name: /Lukas @Lukas/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Request sent to Lukas' })).toBeVisible()
    await shot(page, `friend-search/added-${name}.png`, { keepToasts: true })
    await ctx.close()
  })

  test(`friends list filter in the URL, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends?q=lu')
    await expect(page.getByRole('combobox', { name: 'Search friends or find people' })).toHaveValue('lu')
    await expect(page.getByText('Luke', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Phil', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await shot(page, `friend-search/filter-${name}.png`)
    await ctx.close()
  })
}
