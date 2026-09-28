import { test, expect } from '@playwright/test'

function uniqueUser(seed: string) {
  return {
    name: `E2E Auth ${seed}`,
    email: `e2e-auth-${seed}-${Date.now()}@test.local`,
    password: 'TestPass1!',
  }
}

test('register with new email redirects to app', async ({ page }) => {
  const u = uniqueUser('reg')
  await page.goto('/#/register')
  await page.fill('#reg-name', u.name)
  await page.fill('#reg-email', u.email)
  await page.fill('#reg-password', u.password)
  await page.click('input[type="checkbox"]') // accept terms
  await page.click('button[type="submit"]')
  // Successful registration redirects to CreateSession (#/)
  await page.waitForURL('**/#/')
})

test('login with wrong password shows error', async ({ page }) => {
  await page.goto('/#/login')
  await page.fill('#login-email', 'nobody@test.local')
  await page.fill('#login-password', 'WrongPass1!')
  await page.click('button[type="submit"]')
  // Error message appears — better-auth returns "Invalid credentials" or similar
  await expect(page.locator('text=/invalid|incorrect|credentials/i').first()).toBeVisible()
})

test('login then sign out lands on login page', async ({ page }) => {
  // Register a fresh user
  const u = uniqueUser('logout')
  await page.request.post('http://localhost:5174/api/auth/sign-up/email', {
    data: { name: u.name, email: u.email, password: u.password },
    headers: { Origin: 'http://localhost:5174' },
  })

  // Log in via UI
  await page.goto('/#/login')
  await page.fill('#login-email', u.email)
  await page.fill('#login-password', u.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/#/')

  // Sign out (SideNav link)
  await page.click('a[href="#/login"]:has-text("Sign out")')
  await page.waitForURL('**/#/login')
})
