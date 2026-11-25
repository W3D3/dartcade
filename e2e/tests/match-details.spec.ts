import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

/** A solo X01 from 301, first to 1 leg, manual entry (as rematch.spec.ts), played to the end. */
async function finishSoloX01(page: Page): Promise<void> {
  await startGame(page, {
    mode: 'X01',
    setup: async page => {
      const main = page.locator('main')
      await main.getByRole('radio', { name: '301', exact: true }).click()
      const fewer = main.getByRole('button', { name: 'Fewer legs' })
      const legs = fewer.locator('xpath=following-sibling::span[1]')
      const isOne = async () => /^1\s*leg$/.test(((await legs.textContent()) ?? '').trim())
      for (let i = 0; i < 10 && !(await isOne()); i++) await fewer.click()
      await expect(legs).toHaveText(/^\s*1\s*leg\s*$/)
    },
  })
  const treble = page.getByRole('button', { name: 'Treble', exact: true })
  const double = page.getByRole('button', { name: 'Double', exact: true })
  const throwDart = async (multiplier: typeof treble | null, label: string) => {
    if (multiplier) await multiplier.click()
    await page.click(`button[aria-label="${label}"]`)
  }
  for (let i = 0; i < 3; i++) await throwDart(treble, 'Treble 20')
  await page.getByRole('button', { name: 'Next player' }).click()
  await throwDart(treble, 'Treble 17')
  await throwDart(treble, 'Treble 18')
  await throwDart(double, 'Double 8')
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()
}

/** The newest game in History; clicked at the row's corner, clear of the player badges' profile buttons. */
async function openNewestGame(page: Page): Promise<void> {
  await page.goto('/#/stats/history')
  await page
    .getByRole('link', { name: /X01.*details/ })
    .first()
    .click({ position: { x: 8, y: 8 } })
  await page.waitForURL(url => url.hash.startsWith('#/stats/history/'))
}

test('a finished game opens its details from History', async ({ authedPage: page }) => {
  await finishSoloX01(page)

  await openNewestGame(page)
  await expect(page.getByRole('heading', { name: 'X01' })).toBeVisible()
  await expect(page.getByText('3-dart average')).toBeVisible()
  // Statistics is the first tab and the default: the match's numbers as bars
  await expect(page.getByRole('tab', { name: 'Statistics' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Match statistics' })).toBeVisible()
  await page.getByRole('tab', { name: 'Breakdown' }).click()
  await expect(page.getByRole('table', { name: /Visits in this leg/ })).toContainText('T20')

  await page.getByRole('tab', { name: 'Heatmap' }).click()
  await expect(page.getByText('Where every dart landed')).toBeVisible()
  await expect(page.getByText('In the 20')).toBeVisible()
  await expect(page.getByText('Most hit')).toBeVisible()
  // Manual-entry darts (as thrown above) have no position, so the board falls back to this.
  await expect(page.getByText('No dart positions')).toBeVisible()

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'History' }).click()
  await page.waitForURL(url => url.hash === '#/stats/history')
})

test('a tap on History hits what is under it when table rows are not positioned', async ({ authedPage: page }) => {
  await finishSoloX01(page)
  await finishSoloX01(page)
  await page.goto('/#/stats/history')
  // Safari doesn't make a positioned <tr> the containing block of what is inside it (WebKit bug 240961)
  await page.addStyleTag({ content: 'tr { position: static !important; }' })
  const newest = page.getByRole('link', { name: /X01.*details/ }).first()
  const href = await newest.getAttribute('href')

  const tap = async (box: { x: number; y: number; width: number; height: number } | null) => {
    if (!box) throw new Error('not on screen')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await tap(await page.getByRole('button', { name: 'X01', exact: true }).boundingBox())
  await expect(page).toHaveURL(/#\/stats\/history\?mode=x01$/)

  await tap(await page.getByRole('row').filter({ has: newest }).getByRole('cell').nth(3).boundingBox())
  await page.waitForURL(url => url.hash === href)
})

test("a player's badge opens their profile card, in History and on the details page", async ({ adminPage: page }, testInfo) => {
  // Profile cards come with progression, on for admins
  const name = `e2eadmin${testInfo.parallelIndex}`
  await finishSoloX01(page)

  await page.goto('/#/stats/history')
  const badge = page
    .getByRole('link', { name: `${name}: profile` })
    .filter({ visible: true })
    .first()
  // Hovering the name previews the card; the name itself is the link to the profile
  await badge.hover()
  const card = page.getByRole('dialog', { name: `${name}, profile` })
  await expect(card).toBeVisible()
  await expect(page).toHaveURL(/#\/stats\/history$/)
  await page.mouse.move(0, 0)
  await expect(card).toBeHidden()
  await badge.click()
  await expect(page).toHaveURL(/#\/profile\/[^/]+$/)

  await page.goto('/#/stats/history')
  await openNewestGame(page)
  await page
    .getByRole('region', { name: 'Result', exact: true })
    .getByRole('link', { name: `${name}: profile` })
    .hover()
  await expect(card).toBeVisible()
})

test('an unknown game id shows a not-available page', async ({ authedPage: page }) => {
  await page.goto('/#/stats/history/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText("This game isn't available")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to History' })).toBeVisible()
})
