import { execFileSync } from 'child_process'
import { test, expect } from '@playwright/test'
import { VIEW, open, shot, openHash, userId } from './helpers.js'
import { root } from './compose.js'

// Last online on the friends list, a friend's profile with its Friends section (Luke's friends:
// Phil is also Admin's, Michael is not) and Settings → Friends & privacy. Luke and Phil are offline here.

const sql = (query: string) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.e2e.yaml',
      '-f',
      'e2e/docker-compose.screenshots.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'dartgames',
      '-d',
      'dartgames',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { cwd: root, stdio: 'inherit' },
  )

test('friends: last online, friends of friends, privacy card', async ({ browser }) => {
  test.setTimeout(120_000)
  sql(`UPDATE "user" SET last_seen_at = now() - interval '3 hours' WHERE email = 'luke@dartcade.local'`)
  sql(`UPDATE "user" SET last_seen_at = now() - interval '30 hours' WHERE email = 'phil@dartcade.local'`)
  const luke = await open(browser, 'luke', VIEW.wide)
  const lukeId = await userId(luke.page)
  await luke.ctx.close()
  sql(`UPDATE "user" SET last_seen_at = now() - interval '3 hours' WHERE id = '${lukeId}'`)

  for (const [view, name] of [
    [VIEW.desktop, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/friends')
    await expect(page.getByText(/Last online/).first()).toBeVisible()
    await shot(page, `friends-privacy/friends-last-online-${name}.png`)
    await openHash(page, `/profile/${lukeId}`)
    const friends = page.getByRole('region', { name: 'Friends' })
    await expect(friends.getByText('1 mutual friend')).toBeVisible()
    await friends.scrollIntoViewIfNeeded()
    await shot(page, `friends-privacy/profile-friends-${name}.png`, { fullPage: name === 'phone', settle: 1000 })
    await openHash(page, '/settings/profile')
    await expect(page.getByRole('heading', { name: 'Friends & privacy' })).toBeVisible()
    await page.getByRole('heading', { name: 'Friends & privacy' }).scrollIntoViewIfNeeded()
    await shot(page, `friends-privacy/settings-card-${name}.png`, { fullPage: true, settle: 1000 })
    await ctx.close()
  }
})
