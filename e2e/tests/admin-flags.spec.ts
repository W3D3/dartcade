import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { makeAdmin } from '../fixtures/auth.js'

// Two concurrent identities (admin + a non-admin player) need two browser contexts: the
// fixtures/auth.ts `adminPage`/`authedPage` fixtures both key off the single `page` fixture, so
// requesting both in one test would sign them in on the same cookie jar.
//
// This flips FLAG_KEY for everyone on the shared e2e backend while it runs (cleared after): other
// specs running in parallel mustn't assert what 121 looks like by default for a non-admin.
const ORIGIN = 'http://localhost:5174'
const FLAG_KEY = 'gamemode.p121.enabled'

async function signIn(page: Page, email: string, name: string, password = 'TestPass1!'): Promise<void> {
  const headers = { Origin: ORIGIN }
  // The admin account may already exist from an earlier run/worker: only the sign-in must succeed
  await page.request.post(`${ORIGIN}/api/auth/sign-up/email`, { data: { name, email, password, acceptTerms: true }, headers })
  const res = await page.request.post(`${ORIGIN}/api/auth/sign-in/email`, { data: { email, password }, headers })
  expect(res.ok(), `sign-in failed for ${email}: ${res.status()} ${await res.text()}`).toBeTruthy()
}

async function clearOverride(admin: Page): Promise<void> {
  await admin.request.delete(`${ORIGIN}/api/admin/flags/${FLAG_KEY}`, { headers: { Origin: ORIGIN } })
}

let admin: Page

test.beforeEach(async ({ browser }, testInfo) => {
  const ctx = await browser.newContext()
  admin = await ctx.newPage()
  // One admin per worker, as fixtures/auth.ts's adminPage; the role is read per request, so setting it after sign-in counts
  const email = `e2e-admin-${testInfo.parallelIndex}@test.local`
  await signIn(admin, email, `e2eadmin${testInfo.parallelIndex}`)
  makeAdmin(email)
  await clearOverride(admin)
})

test.afterEach(async () => {
  // However the test ended, don't leave 121 turned on for everyone else
  await clearOverride(admin)
  await admin.context().close()
})

test('an admin turns 121 on for everyone at runtime, and a player sees it with no restart', async ({ browser }, testInfo) => {
  const playerCtx = await browser.newContext()
  const player = await playerCtx.newPage()
  const ts = Date.now()
  // Short enough for the name rules (2-20 chars): fixtures/auth.ts's authedPage follows the same shape
  await signIn(player, `e2e-fp-${testInfo.workerIndex}-${ts}@test.local`, `e2efp${testInfo.workerIndex}-${ts.toString(36)}`)

  const card = player.locator('main').getByRole('button', { name: /^121:/ })

  // Before: 121 is admins-only, so a plain player's Play page doesn't offer it
  await player.goto('/#/')
  await expect(card).toHaveCount(0)

  // The admin opens the flag's row, which opens its details card beside the table, and turns it on for everyone
  await admin.goto('/#/admin/flags')
  const flagRow = admin.getByRole('row', { name: `Open details for ${FLAG_KEY}` })
  await expect(flagRow).toBeVisible()
  await flagRow.click()
  await expect(flagRow).toHaveAttribute('aria-current', 'true')
  await expect(admin).toHaveURL(new RegExp(`\\?flag=${FLAG_KEY.replaceAll('.', '\\.')}$`))
  const panel = admin.getByRole('region', { name: FLAG_KEY })
  await expect(panel.getByRole('heading', { name: FLAG_KEY })).toBeVisible()
  await panel.getByRole('button', { name: 'Everyone', exact: true }).click()
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByText('Live now', { exact: false })).toBeVisible()

  // After: the same player, reloading, now sees the 121 card
  await player.reload()
  await expect(card).toBeVisible()

  // The admin sets it back to its default (admins-only)
  await panel.getByRole('button', { name: /^Default/ }).click()
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByText('Live now', { exact: false })).toBeVisible()

  await player.reload()
  await expect(card).toHaveCount(0)

  await playerCtx.close()
})
