import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { closeToasts, open, openHash, shot } from './helpers.js'
import type { View } from './helpers.js'

// Sign in with Discord: the button on sign-in and register, and deleting a Discord-only account;
// docs/discord-login/<scene>-<size>.png. The stack has no Discord app, so /api/auth-info is told it
// has one, and for the delete scenes /api/me says Phil signs in only through Discord.

const SIZES = {
  desktop: { width: 1440, height: 900, scale: 1 },
  phone: { width: 390, height: 844, scale: 2 },
} satisfies Record<string, View>

async function withDiscord(page: Page, discordOnly = false): Promise<void> {
  await page.route('**/api/auth-info', async r => r.fulfill({ json: { ...(await (await r.fetch()).json()), discord: true } }))
  if (discordOnly)
    await page.route(/\/api\/me$/, async r => {
      if (r.request().method() !== 'GET') return r.continue()
      return r.fulfill({ json: { ...(await (await r.fetch()).json()), email: null, signInMethods: ['discord'] } })
    })
}

for (const [size, view] of Object.entries(SIZES)) {
  test(`sign in and register, ${size}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, null, view)
    await withDiscord(page)
    for (const scene of ['login', 'register']) {
      await openHash(page, `/${scene}`)
      await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeVisible()
      await shot(page, `discord-login/${scene}-${size}.png`, { fullPage: true })
    }
    await ctx.close()
  })

  test(`delete a Discord-only account, ${size}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'phil', view)
    await withDiscord(page, true)
    await openHash(page, '/settings/profile')
    // The "Connect your board" card would sit under the dialog, where shot() can't hide it
    await closeToasts(page)
    await page.getByRole('button', { name: 'Delete account' }).click()
    await page.getByLabel(/to confirm/).fill('Phil')
    await expect(page.getByRole('button', { name: 'Sign in with Discord' })).toBeEnabled()
    await shot(page, `discord-login/delete-reauth-${size}.png`)
    const { id } = (await (await page.request.get('/api/me')).json()) as { id: string }
    await openHash(page, `/settings/profile?confirmDelete=${id}`)
    await expect(page.getByText('You signed in with Discord again')).toBeVisible()
    await shot(page, `discord-login/delete-confirm-${size}.png`)
    await ctx.close()
  })
}
