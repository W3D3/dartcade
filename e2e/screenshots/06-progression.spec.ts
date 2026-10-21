import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, shot, hostLobby, leaveLobby, addBot, startLobbyGame, dart, entryMode, openHash, userId, X01 } from './helpers.js'

// Progression: the XP chip on the win screen, the Progress page (level, day streak, challenges,
// your card) and a profile with its popup

async function visit(page: Page, darts: string[], done = true): Promise<void> {
  for (const d of darts) await dart(page, d)
  if (done) await page.getByRole('button', { name: 'Next player' }).click()
}

test('progression: the win screen chip, the Progress page and a profile', async ({ browser }) => {
  test.setTimeout(180_000)
  const admin = await open(browser, 'admin', VIEW.wide)
  // 301 against a level 1 bot: a 180, three singles, then T20 T18 S4 to finish in 9 darts
  const lobby = await hostLobby(admin.page, "Admin's lobby", X01({ startScore: 301, outMode: 'straight', firstTo: 1 }))
  await addBot(admin.page, lobby, 1)
  await startLobbyGame(admin.page, lobby)
  await entryMode(admin.page, 'Enter')
  // The bot throws its visit in its own time: wait until it's Admin's turn again
  const myTurn = async () => {
    await expect(admin.page.getByRole('region', { name: 'Admin, throwing' })).toBeHidden({ timeout: 10_000 })
    await expect(admin.page.getByRole('region', { name: 'Admin, throwing' })).toBeVisible({ timeout: 30_000 })
  }
  await visit(admin.page, ['T20', 'T20', 'T20'])
  await myTurn()
  await visit(admin.page, ['S1', 'S1', 'S1'])
  await myTurn()
  await visit(admin.page, ['T20', 'T18', 'S4'], false)
  await admin.page.getByRole('button', { name: 'Finish game' }).click()
  const chip = admin.page.getByRole('button', { name: /XP\. Show the breakdown/ })
  await expect(chip).toBeVisible({ timeout: 15_000 })
  await chip.click()
  await shot(admin.page, 'progression/win-xp-desktop.png', { settle: 2500 })
  await leaveLobby(admin.page)

  await openHash(admin.page, '/progress')
  await expect(admin.page.getByRole('region', { name: 'Daily challenges' })).toBeVisible()
  await shot(admin.page, 'progression/progress-desktop.png', { fullPage: true, settle: 1500 })

  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, '/progress')
  await expect(phone.page.getByRole('region', { name: 'Level' })).toBeVisible()
  await shot(phone.page, 'progression/progress-phone.png', { settle: 1500 })
  await phone.ctx.close()

  // Luke's profile, as Admin sees it, and the popup from the friends list
  const luke = await open(browser, 'luke', VIEW.wide)
  const lukeId = await userId(luke.page)
  await luke.ctx.close()
  await openHash(admin.page, `/profile/${lukeId}`)
  await expect(admin.page.getByRole('region', { name: "Luke's card" })).toBeVisible()
  await shot(admin.page, 'progression/profile-desktop.png', { settle: 1000 })
  await openHash(admin.page, '/profile')
  await expect(admin.page.getByRole('region', { name: "Admin's card" })).toBeVisible()
  await admin.page.getByRole('button', { name: 'Back' }).hover()
  await shot(admin.page, 'progression/profile-self-desktop.png', { settle: 1000 })
  await admin.ctx.close()
})
