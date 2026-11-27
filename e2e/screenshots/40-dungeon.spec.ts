import { test, expect } from '@playwright/test'
import { VIEW, addGuest, dart, entryMode, hostLobby, leaveLobby, endActiveGames, open, shot, startLobbyGame } from './helpers.js'

// Dungeon (behind gamemode.dungeon.enabled, on for admins): its Play page card and setup form, and the
// placeholder match screen. DUNGEON_SHOTS=before takes the Play page without the card, as on main (the
// stack's FLAGS_ON keeps the flag on, so the card is taken out of the page).
const BEFORE = process.env.DUNGEON_SHOTS === 'before'
const DUNGEON = { gameId: 'dungeon', config: { difficulty: 'medium', floors: 9 } }

test('the Play page card and the setup form', async ({ browser }) => {
  for (const [view, name] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    await leaveLobby(page)
    await page.goto('/#/play')
    const minigolf = page.locator('main').getByRole('button', { name: /^Minigolf:/ })
    await minigolf.scrollIntoViewIfNeeded()
    const card = page.locator('main').getByRole('button', { name: /^Dungeon:/ })
    await expect(card).toBeVisible()
    if (BEFORE) await card.evaluate(el => el.remove())
    await shot(page, `dungeon/play-card-${BEFORE ? 'before' : 'after'}-${name}.png`)
    if (!BEFORE && name === 'desktop') {
      await card.click()
      await expect(page.getByRole('button', { name: /Choose players/ })).toBeVisible()
      await shot(page, 'dungeon/setup-desktop.png')
    }
    await ctx.close()
  }
})

test('the placeholder match screen', async ({ browser }) => {
  test.skip(BEFORE, 'Dungeon has no screen on main')
  for (const [view, name] of [
    [VIEW.desktop, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, "Admin's dungeon", DUNGEON)
    await addGuest(page, lobby, 'Lena')
    await startLobbyGame(page, lobby)
    await expect(page.getByText(/pick a class/)).toBeVisible()
    await shot(page, `dungeon/placeholder-setup-${name}.png`)

    await page.getByRole('button', { name: 'Archer', exact: true }).click()
    await page.getByRole('button', { name: 'Brawler', exact: true }).click()
    // Phones show the keypad toggle as one icon button
    if (name === 'phone') await page.getByRole('button', { name: 'Enter darts by number' }).click()
    else await entryMode(page, 'Enter')
    // Both heroes vote for the left room with a 19
    for (let i = 0; i < 2; i++) {
      await dart(page, 'S19')
      await page.getByRole('button', { name: /Next/ }).first().click()
    }
    await expect(page.getByText(/· battle ·/)).toBeVisible()
    for (const label of ['T20', 'D19', 'S5']) await dart(page, label)
    await expect(page.getByText(/Last visit:/)).toBeVisible()
    await shot(page, `dungeon/placeholder-battle-${name}.png`)

    await endActiveGames(page)
    await leaveLobby(page)
    await ctx.close()
  }
})
