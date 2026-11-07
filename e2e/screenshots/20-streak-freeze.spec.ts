import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, shot, openHash } from './helpers.js'

// The streak card's freeze tooltip: opens on tap or click and on Enter, closes on Escape and on a
// tap outside (a hover-only tooltip would be useless on a phone)

async function freezeTrigger(page: Page) {
  await openHash(page, '/progress')
  const card = page.getByRole('region', { name: 'Day streak' })
  const trigger = card.getByRole('button', { name: 'How freezes work' })
  await page.waitForLoadState('networkidle')
  // Centred, so the click has nothing left to scroll: a scroll after it opens would close the bubble
  await trigger.evaluate(el => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(800)
  return trigger
}

test('streak freeze tooltip: opens and closes, then the screenshots', async ({ browser }) => {
  const phone = await open(browser, 'admin', VIEW.smallPhone)
  const trigger = await freezeTrigger(phone.page)
  const help = phone.page.getByText('A freeze is used on its own')

  await trigger.tap()
  await expect(help).toBeVisible()
  await phone.page.mouse.click(8, 8)
  await expect(help).toBeHidden()

  await trigger.focus()
  await phone.page.keyboard.press('Enter')
  await expect(help).toBeVisible()
  await phone.page.keyboard.press('Escape')
  await expect(help).toBeHidden()

  await trigger.tap()
  await expect(help).toBeVisible()
  await shot(phone.page, 'streak-freeze/phone-360.png', { settle: 800 })
  await phone.ctx.close()

  const p390 = await open(browser, 'admin', VIEW.phone)
  await (await freezeTrigger(p390.page)).tap()
  await expect(p390.page.getByText('A freeze is used on its own')).toBeVisible()
  await shot(p390.page, 'streak-freeze/phone-390.png', { settle: 800 })
  await p390.ctx.close()

  const wide = await open(browser, 'admin', VIEW.desktopTall)
  await (await freezeTrigger(wide.page)).click()
  await expect(wide.page.getByText('A freeze is used on its own')).toBeVisible()
  await shot(wide.page, 'streak-freeze/desktop.png', { settle: 800 })
  await wide.ctx.close()
})
