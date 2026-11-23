import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// Join our Discord (DISCORD_INVITE_URL): the side nav link, the tablet rail's icon and Home's What's
// new tile; docs/discord/<size>-<scene>.png. GET /api/auth-info is answered here, so the stack needs no env.
const INVITE = 'https://discord.gg/TT4BKrQeM2'

async function authInfo(page: Page, discordInviteUrl: string | null): Promise<void> {
  await page.route('**/api/auth-info', async route => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), discordInviteUrl } })
  })
}

for (const [scene, invite] of [
  ['set', INVITE],
  ['unset', null],
] as const) {
  for (const [name, view] of [
    ['desktop', { width: 1440, height: 1250, scale: 1 }],
    ['tablet', { width: 820, height: 1700, scale: 1 }],
  ] as const) {
    test(`home at ${name}, ${scene}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, 'phil', view)
      await authInfo(page, invite)
      await openHash(page, '/')
      const link = page.getByRole('link', { name: 'Join our Discord' })
      if (invite) {
        await expect(link.first()).toHaveAttribute('href', INVITE)
        await expect(link.first()).toHaveAttribute('target', '_blank')
      } else {
        await expect(page.getByRole('navigation', { name: 'Main' }).locator('visible=true')).toBeVisible()
        await expect(link).toHaveCount(0)
      }
      await shot(page, `discord/${name}-${scene}.png`)
      await ctx.close()
    })
  }
}
