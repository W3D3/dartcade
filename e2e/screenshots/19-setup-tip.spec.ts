import { test, expect } from '@playwright/test'
import { VIEW, X01, open, shot, hostLobby, leaveLobby, startLobbyGame, endGame, dart, entryMode, openHash } from './helpers.js'

// The setup tip: with one dart left and no finish for the score, the third slot suggests where to aim
// to leave one. SETUP_TIP_SHOTS names the set ('after' on the branch, 'before' with the tip switched off).
const set = process.env.SETUP_TIP_SHOTS ?? 'after'

test('setup tip: last dart on 48', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.wide)
  const lobby = await hostLobby(phil.page, "Phil's lobby", X01({ startScore: 301 }))
  const session = await startLobbyGame(phil.page, lobby)

  // 177 scored in the first visit; the second leaves 48 (not a finish) with one dart to go
  await entryMode(phil.page, 'Enter')
  for (const d of ['T20', 'T20', 'T19']) await dart(phil.page, d)
  await phil.page.getByRole('button', { name: 'Next player' }).click()
  for (const d of ['T20', 'S16']) await dart(phil.page, d)
  if (set === 'after') await expect(phil.page.getByText(/Setup · leaves/).first()).toBeVisible({ timeout: 20_000 })
  await entryMode(phil.page, 'Board')
  await shot(phil.page, `setup-tip/${set}-desktop.png`)

  const phone = await open(browser, 'phil', VIEW.phone)
  await openHash(phone.page, `/session/${session}`)
  await expect(phone.page.getByRole('button', { name: 'Next player' })).toBeVisible({ timeout: 20_000 })
  if (set === 'after') await expect(phone.page.getByText(/Setup · leaves/).first()).toBeVisible({ timeout: 20_000 })
  await shot(phone.page, `setup-tip/${set}-phone.png`)
  await phone.ctx.close()

  await endGame(phil.page)
  await leaveLobby(phil.page)
  await phil.ctx.close()
})
