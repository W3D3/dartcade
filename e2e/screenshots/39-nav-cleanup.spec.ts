import fs from 'fs'
import { test, expect } from '@playwright/test'
import { open, openHash, shot } from './helpers.js'
import type { View } from './helpers.js'

// The Play hub (New game, Ranked, Missions tabs) and Stats with its History tab, plus the navs they
// changed: docs/nav-cleanup/<size>-<scene>.png. NAV_SHOTS=before takes the same scenes on the old
// pages (prefix `before-`): Matchmaking and History were their own pages then.

const before = process.env.NAV_SHOTS === 'before'
const STATS = JSON.parse(fs.readFileSync(new URL('./stats-x01.json', import.meta.url), 'utf8')) as Record<string, unknown>
const SIZES = {
  desktop: { width: 1440, height: 900, scale: 1 },
  tablet: { width: 820, height: 1180, scale: 1 },
  phone: { width: 390, height: 844, scale: 2 },
} satisfies Record<string, View>
const SCENES = {
  'play-new-game': '/play',
  'play-ranked': before ? '/matchmaking' : '/play/ranked',
  'play-missions': '/play/missions',
  'stats-overview': '/stats',
  'stats-history': before ? '/history' : '/stats/history',
}
// Portrait iPad (the 820 one is `tablet`): the Play page's game cards, two a row
const IPAD_768 = { width: 768, height: 1024, scale: 1 } satisfies View
const file = (size: string, scene: string) => `nav-cleanup/${before ? 'before-' : ''}${size}-${scene}.png`

for (const [size, view] of Object.entries(SIZES)) {
  test(`${size}: the Play and Stats tabs`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.route('**/api/stats/x01*', route => route.fulfill({ json: STATS }))
    for (const [scene, hash] of Object.entries(SCENES)) {
      await openHash(page, hash)
      if (!before && scene.startsWith('play-')) await expect(page.getByRole('navigation', { name: 'Play' })).toBeVisible()
      if (!before && scene.startsWith('stats-')) await expect(page.getByRole('navigation', { name: 'Stats' })).toBeVisible()
      await shot(page, file(size, scene), { settle: 600 })
    }
    if (size === 'tablet') {
      const ipad = await open(browser, 'admin', IPAD_768)
      await openHash(ipad.page, '/play')
      await shot(ipad.page, file('tablet-768', 'play-new-game'), { settle: 600 })
      await ipad.ctx.close()
    }
    if (size === 'phone') {
      await openHash(page, SCENES['stats-history'])
      await page.getByRole('button', { name: 'Menu' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, file(size, 'menu'), { settle: 400 })
    }
    await ctx.close()
  })
}
