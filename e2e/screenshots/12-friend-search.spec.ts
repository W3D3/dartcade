import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The seed: Admin's friends are Luke and Phil. The search answer is mocked, so one list shows every state.
const HITS = [
  { id: 'u1', name: 'Michael', mutualFriends: 2, request: 'none' },
  { id: 'u2', name: 'Gerwyn', mutualFriends: 1, request: 'received' },
  { id: 'u3', name: 'Michaela', mutualFriends: 0, request: 'sent' },
  { id: 'u4', name: 'Luke', mutualFriends: 3, request: 'friends' },
].map(h => ({ ...h, avatar: { kind: 'none' } }))

for (const [view, name] of [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`friend search and filter, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends')
    await expect(page.getByText('Luke', { exact: true }).first()).toBeVisible()

    await page.route('**/api/friends/search*', route => route.fulfill({ json: { users: HITS } }))
    const field = page.getByLabel('Name or email')
    await field.fill('mic')
    const matches = page.getByRole('list', { name: 'Matches' })
    await expect(matches.getByText('Michaela')).toBeVisible()
    await expect(matches.getByText('Wants to be your friend · 1 friend in common')).toBeVisible()
    await expect(matches.getByText('Request sent')).toBeVisible()
    await shot(page, `friend-search/add-${name}.png`)

    await field.fill('')
    await page.goto('/#/friends?q=lu')
    await expect(page.getByLabel('Filter your friends')).toHaveValue('lu')
    await expect(page.getByText('Phil', { exact: true })).toHaveCount(0)
    await shot(page, `friend-search/filter-${name}.png`)
    await ctx.close()
  })
}
