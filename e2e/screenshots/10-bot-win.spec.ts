import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, addBot, X01, startLobbyGame, leaveLobby, dart, entryMode } from './helpers.js'

// A bot ahead when the game is finished wins: the win screen draws its robot picture (#445).
// BEFORE=1 names the files for the "before" run against the old code.
const suffix = process.env.BEFORE ? '-before' : ''

for (const [layout, bots] of [
  ['duel', [10]],
  ['party', [10, 6]],
] as const) {
  test(`a bot wins: ${layout}`, async ({ browser }) => {
    test.setTimeout(420_000)
    const michael = await open(browser, 'michael', VIEW.desktop)
    const lobby = await hostLobby(michael.page, "Michael's lobby", X01({ startScore: 32, firstTo: 1 }))
    for (const level of bots) await addBot(michael.page, lobby, level)
    await startLobbyGame(michael.page, lobby)
    await entryMode(michael.page, 'Enter')
    // Michael only ever misses, so a bot checks out first
    const won = michael.page
      .getByRole('region', { name: /wins/i })
      .or(michael.page.getByRole('heading', { name: /wins/i }))
      .first()
    for (let turn = 0; turn < 40 && !(await won.isVisible()); turn++) {
      const next = michael.page.getByRole('button', { name: 'Next player' })
      if (
        await michael.page
          .getByRole('button', { name: 'Miss', exact: true })
          .isEnabled({ timeout: 500 })
          .catch(() => false)
      ) {
        for (let i = 0; i < 3; i++) await dart(michael.page, 'MISS')
        await next.click({ timeout: 2000 }).catch(() => undefined)
      }
      await michael.page.waitForTimeout(3000)
    }
    await expect(won).toBeVisible()
    await shot(michael.page, `bots/win-${layout}${suffix}.png`)
    await leaveLobby(michael.page)
    await michael.ctx.close()
  })
}
