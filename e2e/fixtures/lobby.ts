import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Each worker's admin is shared by the specs that run in it, and some specs start a game they
 *  never finish: clear any game left running, before and after, regardless of run order. */
export async function endAnyRunningGame(page: Page): Promise<void> {
  await page.goto('/#/')
  const backToGame = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Back to game' })
  if (!(await backToGame.isVisible().catch(() => false))) return
  await backToGame.click()
  await page.waitForURL('**/#/session/**')
  await page.getByRole('button', { name: 'End' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End game' }).click()
  await page.waitForURL(url => !url.hash.startsWith('#/session/'))
}

/**
 * Every game runs in a lobby: New game picks the game, Choose players opens the lobby with it,
 * guests are added there, and Start opens the game. A fresh test user owns no boards, so
 * everyone plays with manual entry and a solo start never asks "Start anyway?".
 */
export async function startGame(page: Page, opts: { mode: 'ATC' | 'X01' | 'Minigolf' | '121'; setup?: (page: Page) => Promise<void>; guests?: string[] }) {
  await page.goto('/#/')
  const main = page.locator('main')
  // The game's card (named "X01: Count down…"): the page may open on a game already, with phone
  // chips for the games hidden in it, so match the card and nothing that only reads the same.
  // The Choose players button shows once a game is picked.
  await main.getByRole('button', { name: new RegExp(`^${opts.mode}:`) }).click()
  const create = main.getByRole('button', { name: /Choose players/ })
  await expect(create).toBeEnabled()
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
