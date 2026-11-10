import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'
import { TIMEOUT } from '../fixtures/timeouts.js'

// Player-made minigolf courses, part C: browsing them, reporting one, a moderator unpublishing it
// with a reason, and the author reading that reason

test('minigolf: browse, report, moderate and the author sees why', async ({ browser }) => {
  test.setTimeout(240_000)
  const luke = await open(browser, 'luke', VIEW.desktop)
  const lp = luke.page
  await lp.goto('/#/minigolf/courses')
  await lp.getByRole('button', { name: 'New course' }).click()
  await lp.waitForURL(/\/minigolf\/courses\/[^/]+$/)
  await lp.locator('label:has-text("Course name") input').fill('Luke’s garage links')
  await lp.getByRole('textbox', { name: 'Short description' }).fill('Three tricky lanes')
  for (let i = 0; i < 2; i++) {
    await lp.getByRole('button', { name: 'New hole', exact: true }).click()
    await lp.waitForURL(/\/minigolf\/holes\//)
    await expect(lp.getByText(/^Saved /)).toBeVisible({ timeout: TIMEOUT.short })
    await lp.getByRole('link', { name: 'Done' }).click()
    await lp.waitForURL(/\/minigolf\/courses\/[^/]+$/)
  }
  await lp.getByRole('button', { name: 'Publish changes' }).click()
  await expect(lp.getByRole('button', { name: 'Unpublish' })).toBeEnabled()

  const phil = await open(browser, 'phil', VIEW.desktop)
  const pp = phil.page
  await pp.goto('/#/minigolf/browse')
  await expect(pp.getByText('Luke’s garage links')).toBeVisible()
  await shot(pp, 'minigolf-course-moderation/browse-desktop.png', { settle: 1500 })
  await pp.getByRole('button', { name: 'Report' }).click()
  await pp.getByRole('textbox').fill('The name is a joke at someone’s expense')
  await shot(pp, 'minigolf-course-moderation/report-dialog-desktop.png')
  await pp.getByRole('button', { name: 'Send report' }).click()
  await expect(pp.getByRole('status')).toContainText('Thanks')

  const admin = await open(browser, 'admin', VIEW.desktop)
  const ap = admin.page
  await ap.goto('/#/admin/minigolf/reports')
  await expect(ap.getByText('The name is a joke')).toBeVisible()
  await shot(ap, 'minigolf-course-moderation/reports-desktop.png', { settle: 1500 })
  await ap.getByRole('button', { name: 'Unpublish' }).click()
  await ap.getByRole('textbox').fill('The name mocks a named person')
  await shot(ap, 'minigolf-course-moderation/unpublish-dialog-desktop.png')
  await ap.getByRole('button', { name: 'Unpublish' }).last().click()
  await expect(ap.getByRole('region', { name: 'Taken down' })).toBeVisible()
  await shot(ap, 'minigolf-course-moderation/taken-down-desktop.png', { settle: 1500 })

  await lp.reload()
  await expect(lp.getByRole('status').filter({ hasText: 'A moderator took this course out of play' })).toBeVisible()
  await shot(lp, 'minigolf-course-moderation/author-notice-desktop.png', { settle: 1500 })
  await lp.getByRole('button', { name: 'Publish changes' }).click()
  await expect(lp.getByRole('alert')).toContainText('The name mocks a named person')

  for (const s of [luke, phil, admin]) await s.ctx.close()
})
