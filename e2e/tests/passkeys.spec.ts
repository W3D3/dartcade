import { test, expect, makeAdmin } from '../fixtures/auth.js'
import type { Page } from '@playwright/test'
import { E2E_ORIGIN } from '../fixtures/origin.js'

// Passkeys are behind auth.passkeys.enabled, admins only by default: the account is made an admin.
// Chromium's virtual authenticator (CDP WebAuthn) stands in for the fingerprint reader.

async function withAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

async function signedUpAdmin(page: Page, seed: string) {
  const ts = Date.now()
  const user = { name: `pk${seed}${ts.toString(36)}`, email: `e2e-passkey-${seed}-${ts}@test.local`, password: 'TestPass1!' }
  const headers = { Origin: E2E_ORIGIN }
  const up = await page.request.post(`${E2E_ORIGIN}/api/auth/sign-up/email`, { data: { ...user, acceptTerms: true }, headers })
  expect(up.ok(), `sign-up failed: ${up.status()}`).toBeTruthy()
  makeAdmin(user.email)
  const inn = await page.request.post(`${E2E_ORIGIN}/api/auth/sign-in/email`, {
    data: { email: user.email, password: user.password },
    headers,
  })
  expect(inn.ok(), `sign-in failed: ${inn.status()}`).toBeTruthy()
  return user
}

async function addPasskey(page: Page, name: string) {
  await page.goto('/#/settings/profile')
  await page.getByLabel('Name for the new passkey').fill(name)
  await page.getByRole('button', { name: 'Add a passkey' }).click()
  await expect(page.getByRole('list', { name: 'Your passkeys' }).getByText(name)).toBeVisible()
}

test('add a passkey, sign in with it, then delete the account with it', async ({ page }) => {
  await withAuthenticator(page)
  const user = await signedUpAdmin(page, 'del')
  await addPasskey(page, 'Work laptop')

  // Sign out, then back in with the passkey alone. The virtual authenticator answers the sign-in
  // page's autofill request at once, so that is switched off here to press the button (next test).
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false)
  })
  await page.request.post(`${E2E_ORIGIN}/api/auth/sign-out`, { headers: { Origin: E2E_ORIGIN } })
  await page.goto('/#/login')
  await page.reload()
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await page.waitForURL('**/#/')

  // Delete the account, confirming with the passkey: no password typed
  await page.goto('/#/settings/profile')
  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByLabel(/^Type .* to confirm$/).fill(user.name)
  await page.getByRole('button', { name: 'Confirm with a passkey' }).click()
  await page.waitForURL('**/#/login?deleted=1')
  await expect(page.getByText('Your account was deleted.')).toBeVisible()

  // The account is gone: its password no longer signs in
  const again = await page.request.post(`${E2E_ORIGIN}/api/auth/sign-in/email`, {
    data: { email: user.email, password: user.password },
    headers: { Origin: E2E_ORIGIN },
  })
  expect(again.ok()).toBeFalsy()
})

test('rename a passkey and remove it', async ({ page }) => {
  await withAuthenticator(page)
  await signedUpAdmin(page, 'man')
  await addPasskey(page, 'Old name')
  const list = page.getByRole('list', { name: 'Your passkeys' })

  await page.getByRole('button', { name: 'Rename Old name' }).click()
  await page.getByLabel('Passkey name').fill('Phone')
  await list.getByRole('button', { name: 'Save' }).click()
  await expect(list.getByText('Phone')).toBeVisible()
  await expect(list.getByText('Never used')).toBeVisible()

  await page.getByRole('button', { name: 'Remove Phone' }).click()
  await expect(page.getByText('No passkeys yet.')).toBeVisible()
})

test('the sign-in page signs in by itself through the browser’s autofill', async ({ page }) => {
  await withAuthenticator(page)
  await signedUpAdmin(page, 'auto')
  await addPasskey(page, 'Laptop')
  await page.request.post(`${E2E_ORIGIN}/api/auth/sign-out`, { headers: { Origin: E2E_ORIGIN } })
  await page.goto('/#/login')
  await page.reload()
  await page.waitForURL('**/#/')
})
