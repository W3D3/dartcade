import { execFileSync } from 'child_process'
import { test, expect } from '@playwright/test'
import { VIEW, api, open, shot } from './helpers.js'
import { root } from './compose.js'

// The Friends page rows with the friend's flag and X01 average class next to the name. The seed's friends already have X01 games
// (their average class shows); everyone gets a country, so friends, the request for you (Gerwyn), a request you sent (Michael) and a search hit all show a flag.

const sql = (query: string) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.e2e.yaml',
      '-f',
      'e2e/docker-compose.screenshots.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'dartgames',
      '-d',
      'dartgames',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { cwd: root, stdio: 'inherit' },
  )

test('friends list: flag and average', async ({ browser }) => {
  test.setTimeout(120_000)
  sql(`UPDATE "user" SET country = 'AT', last_seen_at = now() - interval '3 hours' WHERE email = 'luke@dartcade.local'`)
  sql(`UPDATE "user" SET country = 'DE', last_seen_at = now() - interval '30 hours' WHERE email = 'phil@dartcade.local'`)

  sql(`UPDATE "user" SET country = 'IE' WHERE email = 'gerwyn@dartcade.local'`)
  sql(`UPDATE "user" SET country = 'NL' WHERE email = 'michael@dartcade.local'`)
  {
    const { ctx, page } = await open(browser, 'admin', VIEW.desktop)
    await api(page).post('/api/friends/requests', { name: 'Michael' })
    await ctx.close()
  }

  for (const [view, name] of [
    [VIEW.desktop, 'desktop'],
    [VIEW.phone, 'phone'],
    [VIEW.narrowPhone, 'narrow-phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends')
    await expect(page.getByText(/Last online/).first()).toBeVisible()
    await expect(page.getByRole('img', { name: 'Austria' }).first()).toBeVisible()
    await expect(page.getByRole('img', { name: 'Ireland' }).first()).toBeVisible()
    await shot(page, `friends-list/friends-${name}.png`)
    if (name !== 'narrow-phone') {
      await page.getByRole('combobox', { name: 'Search friends or find people' }).fill('gerw')
      await expect(page.getByRole('img', { name: 'Ireland' }).first()).toBeVisible()
      await shot(page, `friends-list/search-${name}.png`)
    }
    await ctx.close()
  }

  const { ctx, page } = await open(browser, 'admin', VIEW.desktop)
  await page.goto('/#/stats')
  await page
    .getByRole('button', { name: /^Friends/ })
    .first()
    .click()
  await expect(page.getByRole('img', { name: 'Austria' }).first()).toBeVisible()
  await shot(page, 'friends-list/drawer-desktop.png')
  await ctx.close()
  sql(`DELETE FROM friendships WHERE status = 'pending' AND requester_id = (SELECT id FROM "user" WHERE email = 'admin@dartcade.local')`)
})
