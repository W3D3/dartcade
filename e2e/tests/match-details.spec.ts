import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

/** A solo X01 from 301, first to 1 leg, manual entry (as rematch.spec.ts), played to the end. */
async function finishSoloX01(page: Page): Promise<void> {
  await startGame(page, {
    mode: 'X01',
    setup: async page => {
      const main = page.locator('main')
      await main.getByRole('button', { name: '301', exact: true }).click()
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
  await page.goto('/#/history')
  await page
    .getByRole('link', { name: /X01.*details/ })
    .first()
    .click({ position: { x: 8, y: 8 } })
  await page.waitForURL(url => url.hash.startsWith('#/history/'))
}

test('a finished game opens its details from History', async ({ authedPage: page }) => {
  await finishSoloX01(page)
  await openNewestGame(page)
  await expect(page.getByRole('heading', { name: 'X01' })).toBeVisible()
  await expect(page.getByText('3-dart average')).toBeVisible()
  await expect(page.getByText('Breakdown')).toBeVisible()
  await expect(page.getByRole('table', { name: /Visits in this leg/ })).toContainText('T20')

  await page.getByRole('tab', { name: 'Heatmap' }).click()
  await expect(page.getByText('Where every dart landed')).toBeVisible()
  await expect(page.getByText('In the 20')).toBeVisible()
  await expect(page.getByText('Most hit')).toBeVisible()
  // Manual-entry darts (as thrown above) have no position, so the board falls back to this.
  await expect(page.getByText('No dart positions')).toBeVisible()

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'History' }).click()
  await page.waitForURL(url => url.hash === '#/history')
})

test("a player's badge in History opens their profile card", async ({ adminPage: page }, testInfo) => {
  // Profile cards come with progression, on for admins
  const name = `e2eadmin${testInfo.parallelIndex}`
  await finishSoloX01(page)

  await page.goto('/#/history')
  const badge = page
    .getByRole('button', { name: `${name}: profile` })
    .filter({ visible: true })
    .first()
  // From the keyboard: Enter opens the card, Esc closes it and gives focus back
  await badge.focus()
  await page.keyboard.press('Enter')
  const card = page.getByRole('dialog')
  await expect(card.getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(page).toHaveURL(/#\/history$/)
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(badge).toBeFocused()
})

test('an unknown game id shows a not-available page', async ({ authedPage: page }) => {
  await page.goto('/#/history/00000000-0000-0000-0000-000000000000')
  await expect(page.getByText("This game isn't available")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to History' })).toBeVisible()
})
