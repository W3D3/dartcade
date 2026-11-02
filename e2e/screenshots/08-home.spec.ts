import { execFileSync } from 'child_process'
import fs from 'fs'
import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'
import { root } from './compose.js'

// Home as Luke sees it. The preview seed plays a handful of games in one go, so a month of form, a
// rating, friends' lobbies and their activity are added in SQL (home-seed.sql)

const tall = { desktop: { ...VIEW.desktop, height: 1500 }, phone: { ...VIEW.phone, height: 2650 } }

test('home', async ({ browser }) => {
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
    ],
    { cwd: root, input: fs.readFileSync(new URL('./home-seed.sql', import.meta.url)), stdio: ['pipe', 'inherit', 'inherit'] },
  )

  for (const [view, file] of [
    [tall.desktop, 'home/home-desktop.png'],
    [tall.phone, 'home/home-phone.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'luke', view)
    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'Join' }).first()).toBeVisible()
    await shot(page, file)
    await ctx.close()
  }
})

// Home scrolls inside <main>, so at real device heights the featured card must keep its full height
// instead of shrinking to its title (#450). The tall shots above can't show that.
test('home featured card is whole at device heights', async ({ browser }) => {
  for (const [view, file] of [
    [VIEW.phone, 'home/featured-phone.png'],
    [VIEW.tabletPortrait, 'home/featured-tablet.png'],
  ] as const) {
    const { ctx, page } = await open(browser, 'luke', view)
    await page.goto('/#/')
    const card = page.getByRole('region', { name: 'Featured' })
    await expect(card).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await shot(page, file)
    const clipped = await card.evaluate(el => el.scrollHeight - el.clientHeight)
    expect(clipped, 'featured card content is clipped').toBeLessThanOrEqual(0)
    await ctx.close()
  }
})
