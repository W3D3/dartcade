import { test, expect } from '@playwright/test'

// Opening the main page signed out goes straight to sign-in: Home must never be on screen, not even
// for a frame (the router used to render the page asked for until the hash change reached it).
test('the main page does not flash before sign-in when signed out', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { sawHome: boolean }
    w.sawHome = false
    new MutationObserver(() => {
      if (document.querySelector('nav[aria-label="Main"]')) w.sawHome = true
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/#/')
  await expect(page.locator('#login-email')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { sawHome: boolean }).sawHome)).toBe(false)
})
