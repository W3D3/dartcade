// "What the coach detects" shows every check of every group, at any width: a group card clipped to the
// scrolling page's height (overflow-hidden on a shrinking flex child) hid most of its rows. Runs on the visual stack.
import { test, expect } from '@playwright/test'

const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}` }
const SIZES = [
  [360, 740],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1920, 1080],
] as const

for (const [width, height] of SIZES) {
  test(`checks are not clipped ${width}x${height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    expect((await page.request.post('/api/auth/sign-in/email', { data: ACCOUNT, headers: HEADERS })).ok()).toBeTruthy()
    await page.goto('/#/coach/checks')
    await expect(page.getByRole('heading', { name: 'Fewest darts' })).toBeAttached({ timeout: 15_000 })
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main section[aria-labelledby^="checks-"]')]
        .filter(s => s.scrollHeight > s.clientHeight + 1)
        .map(s => `${s.getAttribute('aria-labelledby')}: ${s.scrollHeight - s.clientHeight}px cut off`),
    )
    expect(clipped).toEqual([])
    await ctx.close()
  })
}
