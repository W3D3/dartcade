import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export { expect }

export const test = base.extend<{ authedPage: Page; adminPage: Page }>({
  authedPage: async ({ page }, use, testInfo) => {
    const ts = Date.now()
    const email = `e2e-${testInfo.workerIndex}-${ts}@test.local`
    const password = 'TestPass1!'
    const name = `e2e${testInfo.workerIndex}-${ts.toString(36)}`

    // Register via API (Origin header satisfies better-auth CSRF check)
    const signUp = await page.request.post('http://localhost:5174/api/auth/sign-up/email', {
      data: { name, email, password },
      headers: { Origin: 'http://localhost:5174' },
    })
    expect(signUp.ok(), `sign-up failed: ${signUp.status()} ${await signUp.text()}`).toBeTruthy()

    // Sign in — session cookie is set for localhost:5173 via Vite proxy
    const signIn = await page.request.post('http://localhost:5174/api/auth/sign-in/email', {
      data: { email, password },
      headers: { Origin: 'http://localhost:5174' },
    })
    expect(signIn.ok(), `sign-in failed: ${signIn.status()} ${await signIn.text()}`).toBeTruthy()

    await use(page)
  },
  /** Signed in as an e2e admin (ADMIN_EMAILS in docker-compose.e2e.yaml): sees admin pages and flagged-on modes.
   *  One admin per parallel worker: tests that start a game as the admin mustn't meet each other's games. */
  adminPage: async ({ page }, use, testInfo) => {
    const email = `e2e-admin-${testInfo.parallelIndex}@test.local`
    const password = 'TestPass1!'
    const headers = { Origin: 'http://localhost:5174' }
    // Signing up again in a later test fails (the user exists): only the sign-in must succeed
    await page.request.post('http://localhost:5174/api/auth/sign-up/email', { data: { name: `e2eadmin${testInfo.parallelIndex}`, email, password }, headers })
    const signIn = await page.request.post('http://localhost:5174/api/auth/sign-in/email', { data: { email, password }, headers })
    expect(signIn.ok(), `admin sign-in failed: ${signIn.status()}`).toBeTruthy()
    await use(page)
  },
})
