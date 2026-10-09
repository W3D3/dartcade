import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Every game runs in a lobby: New game picks the game, Choose players opens the lobby with it,
 * guests are added there, and Start opens the game. A fresh test user owns no boards, so
 * everyone plays with manual entry and a solo start never asks "Start anyway?".
 */
export async function startGame(page: Page, opts: { mode: 'ATC' | 'X01' | 'Minigolf'; setup?: (page: Page) => Promise<void>; guests?: string[] }) {
  await page.goto('/#/')
  const main = page.locator('main')
  const create = main.getByRole('button', { name: /Choose players/ })
  await expect(create).toBeEnabled()

  await main.locator(`button:has-text("${opts.mode}")`).first().click()
  if (opts.setup) await opts.setup(page)
  await create.click()
  await page.waitForURL('**/#/lobby')

  for (const name of opts.guests ?? []) {
    await page.fill('input[placeholder="Name or @username"]', name)
    await page.getByRole('button', { name: 'Add guest' }).click()
    await expect(page.locator('main').getByText(name, { exact: true }).first()).toBeVisible()
  }

  await page.getByRole('button', { name: /^Start/ }).click()
  await page.waitForURL('**/#/session/**')
}
