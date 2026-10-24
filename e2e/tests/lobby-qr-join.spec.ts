import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

const ORIGIN = 'http://localhost:5174'
const headers = { Origin: ORIGIN }

async function signedIn(browser: Browser, who: string): Promise<{ page: Page; name: string }> {
  const page = await (await browser.newContext()).newPage()
  const ts = Date.now().toString(36)
  const name = `${who}${ts}`
  const email = `e2e-${who}-${ts}@test.local`
  const password = 'TestPass1!'
  const up = await page.request.post(`${ORIGIN}/api/auth/sign-up/email`, { data: { name, email, password, acceptTerms: true }, headers })
  expect(up.ok(), `sign-up failed: ${up.status()}`).toBeTruthy()
  const signIn = await page.request.post(`${ORIGIN}/api/auth/sign-in/email`, { data: { email, password }, headers })
  expect(signIn.ok(), `sign-in failed: ${signIn.status()}`).toBeTruthy()
  return { page, name }
}

async function pairBoard(page: Page, name: string): Promise<string> {
  const res = await page.request.post(`${ORIGIN}/api/boards`, { data: { name }, headers })
  expect(res.ok(), `create board failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { token: string }).token
}

/** A bridge for the board: the board is online while the socket is open. */
async function connectBridge(token: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:5174/bridge?token=${token}`)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  ws.send(JSON.stringify({ v: 1, kind: 'bridge.hello', data: {} }))
  return ws
}

const boardChip = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Board for ${name}: `) })

test('joining by the QR code puts the guest on the host board, and both sides can pick it', async ({ browser }) => {
  const host = await signedIn(browser, 'host')
  const guest = await signedIn(browser, 'guest')
  const bridge = await connectBridge(await pairBoard(host.page, 'Clubhouse'))
  // The guest owns a board too, at home (offline): joining by link would put them there
  await pairBoard(guest.page, 'Home board')

  const created = await host.page.request.post(`${ORIGIN}/api/lobbies`, { headers })
  expect(created.ok()).toBeTruthy()
  await host.page.goto('/#/lobby')
  await expect(boardChip(host.page, host.name)).toContainText('Clubhouse')

  await host.page.getByRole('button', { name: 'Show the QR code' }).click()
  const link =
    (
      await host.page
        .getByRole('dialog', { name: /QR code to join/ })
        .locator('p')
        .textContent()
    )?.trim() ?? ''
  expect(link).toMatch(/\/#\/join\/[A-Z0-9]{6}\?via=qr$/)
  await host.page.keyboard.press('Escape')

  await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await guest.page.getByRole('button', { name: /^Join/ }).click()
  await guest.page.waitForURL('**/#/lobby')

  await expect(boardChip(guest.page, guest.name)).toContainText('Clubhouse')
  await expect(boardChip(host.page, guest.name)).toContainText('Clubhouse')

  // The guest goes home and back to the host board from their own menu
  await boardChip(guest.page, guest.name).click()
  await guest.page.getByRole('menuitemradio', { name: /Home board/ }).click()
  await expect(boardChip(guest.page, guest.name)).toContainText('Home board')
  await boardChip(guest.page, guest.name).click()
  await guest.page.getByRole('menuitemradio', { name: /Clubhouse/ }).click()
  await expect(boardChip(guest.page, guest.name)).toContainText('Clubhouse')

  // The host puts the guest back on the host board after the guest picked their own
  await boardChip(guest.page, guest.name).click()
  await guest.page.getByRole('menuitemradio', { name: /Home board/ }).click()
  await expect(boardChip(host.page, guest.name)).toContainText('Home board')
  await boardChip(host.page, guest.name).click()
  await host.page.getByRole('menuitemradio', { name: /Clubhouse/ }).click()
  await expect(boardChip(guest.page, guest.name)).toContainText('Clubhouse')

  bridge.close()
})
