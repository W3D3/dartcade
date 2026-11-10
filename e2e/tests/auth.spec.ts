import { test, expect } from '@playwright/test'
import { E2E_ORIGIN } from '../fixtures/origin.js'

function uniqueUser(seed: string) {
  return {
    name: `e2e-${seed}-${Date.now().toString(36)}`,
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
  await page.getByRole('checkbox').click() // accept terms
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
  await page.request.post(`${E2E_ORIGIN}/api/auth/sign-up/email`, {
    data: { name: u.name, email: u.email, password: u.password, acceptTerms: true },
    headers: { Origin: E2E_ORIGIN },
  })

  // Log in via UI
  await page.goto('/#/login')
  await page.fill('#login-email', u.email)
  await page.fill('#login-password', u.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/#/')

  // Sign out (the account menu at the foot of the side nav)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('button', { name: /^Account/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL('**/#/login')
})

// Password managers (Bitwarden) score fields by autocomplete, type and name; the final DOM must keep these (#473, #326)
const attrs = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`#${id}`).evaluate(el => ({
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    autocomplete: el.getAttribute('autocomplete'),
  }))

test('register form: email is an email, the name a nickname, the password new', async ({ page }) => {
  await page.goto('/#/register')
  expect(await attrs(page, 'reg-email')).toEqual({ type: 'email', name: 'email', autocomplete: 'email' })
  expect(await attrs(page, 'reg-name')).toMatchObject({ name: 'nickname', autocomplete: 'nickname' })
  expect(await attrs(page, 'reg-password')).toEqual({ type: 'password', name: 'password', autocomplete: 'new-password' })
})

test('sign-in form: the email is the username the manager saves', async ({ page }) => {
  await page.goto('/#/login')
  // a passkey-enabled sign-in adds the webauthn token
  const email = await attrs(page, 'login-email')
  expect(email).toMatchObject({ type: 'email', name: 'email' })
  expect(email.autocomplete).toMatch(/^username( webauthn)?$/)
  expect(await attrs(page, 'login-password')).toEqual({ type: 'password', name: 'password', autocomplete: 'current-password' })
})
