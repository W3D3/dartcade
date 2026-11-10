import { test, expect } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'
import { TIMEOUT } from '../fixtures/timeouts.js'

// Players make their own minigolf courses (minigolf.userCourses.enabled): the My courses list, a
// refused publish, a published course in the Play page's course picker, and the phone banner

test('minigolf: my courses, a refused publish, the picker groups and the phone banner', async ({ browser }) => {
  test.setTimeout(240_000)
  const luke = await open(browser, 'luke', VIEW.desktop)
  const page = luke.page

  await page.goto('/#/minigolf/courses')
  await expect(page.getByText('No courses yet')).toBeVisible()
  await shot(page, 'minigolf-user-courses/my-courses-empty-desktop.png')

  await page.getByRole('button', { name: 'New course' }).click()
  await page.waitForURL(/\/minigolf\/courses\/[^/]+$/)
  await page.locator('label:has-text("Course name") input').fill('Luke’s garage links')
  await page.getByRole('textbox', { name: 'Short description' }).fill('Three tricky lanes')
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one hole')
  await shot(page, 'minigolf-user-courses/publish-refused-desktop.png', { settle: 1500 })

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'New hole', exact: true }).click()
    await page.waitForURL(/\/minigolf\/holes\//)
    await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: TIMEOUT.short })
    await page.getByRole('link', { name: 'Done' }).click()
    await page.waitForURL(/\/minigolf\/courses\/[^/]+$/)
  }
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeEnabled()
  await shot(page, 'minigolf-user-courses/my-courses-published-desktop.png', { settle: 1500 })

  // The Play page: the course picker lists Official and User courses apart
  await page.goto('/#/play')
  await page
    .getByRole('button', { name: /Minigolf/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'User courses' })).toBeVisible()
  await page.getByText('by Luke · 2 holes').scrollIntoViewIfNeeded()
  await shot(page, 'minigolf-user-courses/course-picker-desktop.png')

  const phone = await open(browser, 'luke', VIEW.phone)
  await phone.page.goto('/#/minigolf/courses')
  await expect(phone.page.getByText("The course editor isn't made for phones")).toBeVisible()
  await shot(phone.page, 'minigolf-user-courses/phone-banner.png')
  await phone.ctx.close()
  await luke.ctx.close()
})
