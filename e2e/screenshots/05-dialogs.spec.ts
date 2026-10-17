import { test, expect } from '@playwright/test'
import { VIEW, open, hostLobby, leaveLobby, addGuest, X01, startLobbyGame, docPath } from './helpers.js'

// Dialogs on their own: the PNG is the dialog, not the page behind it

test('pairing a board', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', VIEW.dialog)
  await page.goto('/#/settings/boards')
  await page.getByRole('button', { name: /pair/i }).locator('visible=true').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  // Opens with the help shown: where the bridge prints the code
  await expect(dialog.getByText('Copy command')).toBeVisible()
  await dialog.screenshot({ path: docPath('board-pairing/01-idle.png'), animations: 'disabled' })

  // The code from the example log line, a name picked from the chips
  await dialog.getByLabel('Pairing code').first().click()
  await page.keyboard.type('7KQ4M2XD')
  await dialog.getByRole('button', { name: 'Basement' }).click()
  await dialog.screenshot({ path: docPath('board-pairing/02-ready.png'), animations: 'disabled' })

  // The server says the code expired (answered here: no bridge is waiting with this code)
  await page.route('**/api/pairing/claim', route =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"expired"}' }),
  )
  await dialog.getByRole('button', { name: /Pair board/i }).click()
  await expect(dialog.getByText(/expired/)).toBeVisible()
  await dialog.screenshot({ path: docPath('board-pairing/03-expired.png'), animations: 'disabled' })
  await ctx.close()
})

test('a confirm dialog: ending a game', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'luke', VIEW.dialog)
  const lobby = await hostLobby(page, "Luke's lobby", X01())
  await addGuest(page, lobby, 'Anna')
  await startLobbyGame(page, lobby)
  await page
    .getByRole('button', { name: 'End', exact: true })
    .or(page.getByRole('button', { name: /^End/ }))
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'End game' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await dialog.screenshot({ path: docPath('board-pairing/04-confirm-reuse.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: 'End game' }).click()
  await leaveLobby(page)
  await ctx.close()
})
