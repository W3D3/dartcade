import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export { expect }

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use, testInfo) => {
    const ts = Date.now()
    const email = `e2e-${testInfo.workerIndex}-${ts}@test.local`
    const password = 'TestPass1!'
    const name = `E2E-${testInfo.workerIndex}`

    // Register via API (Origin header satisfies better-auth CSRF check)
    const signUp = await page.request.post('http://localhost:5173/api/auth/sign-up/email', {
      data: { name, email, password },
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(signUp.ok(), `sign-up failed: ${signUp.status()} ${await signUp.text()}`).toBeTruthy()

    // Sign in — session cookie is set for localhost:5173 via Vite proxy
    const signIn = await page.request.post('http://localhost:5173/api/auth/sign-in/email', {
      data: { email, password },
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(signIn.ok(), `sign-in failed: ${signIn.status()} ${await signIn.text()}`).toBeTruthy()

    await use(page)
  },
})
