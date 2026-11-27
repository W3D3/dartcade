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

test('party select, then the map after the first fight', async ({ browser }) => {
  test.skip(BEFORE, 'Dungeon has no screen on main')
  for (const [view, name] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    const lobby = await hostLobby(page, "Admin's dungeon", DUNGEON)
    await addGuest(page, lobby, 'Lena')
    await startLobbyGame(page, lobby)
    await expect(page.getByTestId('dungeon-party')).toBeVisible()
    await page
      .getByRole('button', { name: /^Pick for Admin/ })
      .first()
      .click()
    await expect(page.getByText('Pick for Lena').first()).toBeVisible()
    await shot(page, `dungeon/party-${name}.png`)

    await page
      .locator('[data-class="brawler"]')
      .getByRole('button', { name: /^Pick for/ })
      .click()
    await page.getByRole('button', { name: 'Start run' }).click()
    if (name === 'phone') await page.getByRole('button', { name: 'Enter darts by number' }).click()
    else await entryMode(page, 'Enter')
    // The floor 1 fight (a placeholder until the battle screen): good darts until the map shows
    for (let i = 0; i < 12 && !(await page.getByTestId('dungeon-map').isVisible()); i++) {
      for (const label of ['D19', 'D19', 'D19']) if (!(await page.getByTestId('dungeon-map').isVisible())) await dart(page, label)
      await page
        .getByRole('button', { name: /Next|Finish/ })
        .first()
        .click()
      await page.waitForTimeout(600)
    }
    await expect(page.getByTestId('dungeon-map')).toBeVisible()
    if (name === 'desktop') await dart(page, 'S11')
    else await page.locator('[data-side="left"]').filter({ visible: true }).click()
    await page.waitForTimeout(400)
    await shot(page, `dungeon/map-${name}.png`)

    await endActiveGames(page)
    await leaveLobby(page)
    await ctx.close()
  }
})

test('the run summary on the details page', async ({ browser }) => {
  test.skip(BEFORE, 'Dungeon has no screen on main')
  for (const [view, name] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    // The preview seed plays a Dungeon run (backend/src/seed/sample.ts)
    const { ctx, page } = await open(browser, 'admin', view)
    await endActiveGames(page)
    await page.goto('/#/stats/history')
    const href = await page
      .getByRole('link', { name: /^Dungeon,.*details/ })
      .first()
      .getAttribute('href')
    await page.goto(`/${href}`)
    await expect(page.getByTestId('dungeon-summary')).toBeVisible()
    if (name === 'phone') await page.getByTestId('dungeon-summary').scrollIntoViewIfNeeded()
    await shot(page, `dungeon/summary-${name}.png`)
    await ctx.close()
  }
})
