import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

/** Each worker's admin is shared by the specs that run in it, and game-minigolf.spec.ts starts a
 *  game it never finishes: clear any game left running, before and after, regardless of run order. */
async function endAnyRunningGame(page: Page): Promise<void> {
  await page.goto('/#/')
  const backToGame = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Back to game' })
  if (!(await backToGame.isVisible().catch(() => false))) return
  await backToGame.click()
  await page.waitForURL('**/#/session/**')
  await page.getByRole('button', { name: 'End' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End game' }).click()
  await page.waitForURL(url => !url.hash.startsWith('#/session/'))
}

// A fresh course, not the shared seeded "test" course: this spec publishes a change, and the
// other Minigolf specs (the bench, game-minigolf) must keep working no matter the run order.
test('an admin edits a hole, publishes a course, and a new game plays it', async ({ adminPage: page }) => {
  test.setTimeout(60_000)

  await endAnyRunningGame(page)
  // Admins reach the editor from the account menu
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: /^Account/ })
    .click()
  await page.getByRole('menuitem', { name: 'Admin' }).click()
  await page.getByRole('menuitem', { name: 'Minigolf courses' }).click()
  await page.waitForURL('**/#/admin/minigolf/courses')
  await page.getByRole('button', { name: 'New course' }).click()
  await page.waitForURL(/\/admin\/minigolf\/courses\/[^/]+$/)
  // Unique: parallel workers and reruns all publish to the same course list
  const courseName = `E2E course ${Date.now().toString(36)}`
  await page.locator('label:has-text("Course name") input').fill(courseName)

  // An empty course can't be published; the next edit clears the complaint
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one hole')
  await page.getByRole('textbox', { name: 'Short description' }).fill('One hole')
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByRole('button', { name: 'New hole', exact: true }).click()
  await page.waitForURL(/\/admin\/minigolf\/holes\//)
  await expect(page.getByTestId('par')).toHaveText('2')

  // Edit hole 1's par
  const raisePar = page.getByRole('button', { name: 'Raise par' })
  await raisePar.click()
  await raisePar.click()
  await expect(page.getByTestId('par')).toHaveText('4')
  await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: 10_000 })

  // Back, Publish changes
  await page.getByRole('link', { name: 'Done' }).click()
  await page.waitForURL(/\/admin\/minigolf\/courses\/[^/]+$/)
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByText('Published · no changes')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)

  // A full reload so the Play page's game modes (and the course list in them) are fetched fresh
  await page.reload()

  // Start a solo Minigolf game on the new course and see the new par on the hole card
  await startGame(page, {
    mode: 'Minigolf',
    setup: async p => {
      await p.getByRole('radio', { name: new RegExp(courseName) }).click()
    },
  })
  await expect(page.getByLabel('Hole', { exact: true })).toBeVisible()
  await expect(page.getByText('Par 4')).toBeVisible()

  // Leave no game running for the next test in this worker
  await endAnyRunningGame(page)
})
