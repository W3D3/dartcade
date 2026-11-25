import { test, expect, type Page, type Locator } from '@playwright/test'
import { VIEW, X01, docPath, hostLobby, open, openHash, shot, type View } from './helpers.js'

// The profile card's loading skeleton: the profile request is held until the scene lets it go, so the
// skeleton and the loaded card are each shot, and the card's box is compared between them (no layout
// shift). docs/profile-skeleton/<scene>-<size>.png.

type Gate = { release: () => void }

/** Holds every profile read until `release()`, so the page sits in its loading state. */
async function holdProfiles(page: Page): Promise<Gate> {
  let release!: () => void
  const open = new Promise<void>(r => (release = r))
  await page.route('**/api/users/*/profile', async route => {
    await open
    await route.continue()
  })
  return { release }
}

const box = async (el: Locator) => (await el.boundingBox())!
const skeleton = (page: Page, variant: 'card' | 'hero') => page.locator(`[data-profile-skeleton="${variant}"]`)

async function skeletonShot(page: Page, file: string): Promise<void> {
  await page.waitForTimeout(700) // past the 150 ms delay and the fade
  await page.screenshot({ path: docPath(file), animations: 'disabled', caret: 'hide' })
}

/** Skeleton, then loaded: the same box (size and place) in both, and a shot of each. */
async function scene(page: Page, view: string, o: { name: string; hash: string; variant: 'card' | 'hero'; card: (p: Page) => Locator }) {
  const gate = await holdProfiles(page)
  await openHash(page, o.hash)
  await expect(skeleton(page, o.variant)).toBeVisible()
  await expect(skeleton(page, o.variant)).toHaveCSS('opacity', '1')
  const before = await box(skeleton(page, o.variant))
  await skeletonShot(page, `profile-skeleton/${o.name}-skeleton-${view}.png`)
  gate.release()
  await expect(o.card(page)).toBeVisible()
  await expect(skeleton(page, o.variant)).toHaveCount(0)
  const after = await box(o.card(page))
  expect(
    Math.abs(after.height - before.height),
    `${o.name} height, skeleton ${JSON.stringify(before)} card ${JSON.stringify(after)}`,
  ).toBeLessThanOrEqual(1)
  expect(Math.abs(after.width - before.width), `${o.name} width`).toBeLessThanOrEqual(1)
  expect(Math.abs(after.y - before.y), `${o.name} top`).toBeLessThanOrEqual(1)
  await page.unroute('**/api/users/*/profile')
  await shot(page, `profile-skeleton/${o.name}-loaded-${view}.png`, { settle: 1000 })
}

for (const [view, size] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as [string, View][]) {
  test(`profile skeleton: Settings → Profile and the Profile page (${view})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const { page, ctx } = await open(browser, 'admin', size)
    await scene(page, view, {
      name: 'settings-profile',
      hash: '/settings/profile',
      variant: 'card',
      card: p => p.getByRole('region', { name: 'Your card' }).getByRole('dialog'),
    })
    await scene(page, view, {
      name: 'profile',
      hash: '/profile',
      variant: 'hero',
      card: p => p.getByRole('region', { name: "Admin's card" }),
    })
    await ctx.close()
  })
}

test('profile skeleton: the profile popup holds its place', async ({ browser }) => {
  test.setTimeout(120_000)
  const { page, ctx } = await open(browser, 'admin', VIEW.wide)
  await hostLobby(page, 'Friday Night Darts', X01())
  await openHash(page, '/lobby')
  const name = page.getByRole('link', { name: 'Admin: profile' }).first()
  await expect(name).toBeVisible()
  const gate = await holdProfiles(page)
  await name.hover()
  await expect(skeleton(page, 'card')).toBeVisible()
  await expect(skeleton(page, 'card')).toHaveCSS('opacity', '1')
  const before = await box(skeleton(page, 'card'))
  await skeletonShot(page, 'profile-skeleton/popup-skeleton-desktop.png')
  gate.release()
  const card = page.getByRole('dialog', { name: 'Admin, profile' })
  await expect(card).toBeVisible()
  const after = await box(card)
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1)
  await page.unroute('**/api/users/*/profile')
  await shot(page, 'profile-skeleton/popup-loaded-desktop.png', { settle: 800 })
  await ctx.close()
})

// A skeleton always visibly animates, also with reduced motion (a slower, shallower opacity pulse): a frozen one reads as broken
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`profile skeleton: it animates (${reducedMotion})`, async ({ browser }) => {
    const { page, ctx } = await open(browser, 'admin', VIEW.wide)
    await page.emulateMedia({ reducedMotion })
    const gate = await holdProfiles(page)
    await openHash(page, '/profile')
    const block = skeleton(page, 'hero').locator('.animate-skeleton').first()
    await expect(block).toBeVisible()
    const style = () =>
      block.evaluate(el => ({
        ...(({ animationName, animationDuration }) => ({ animationName, animationDuration }))(getComputedStyle(el)),
      }))
    const { animationName, animationDuration } = await style()
    expect(animationName, 'a running animation').not.toBe('none')
    expect(parseFloat(animationDuration)).toBeGreaterThan(0)
    expect(animationName).toBe(reducedMotion === 'reduce' ? 'skeleton-pulse-soft' : 'skeleton-pulse')
    // ...and it really changes what is drawn
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      seen.add(await block.evaluate(el => getComputedStyle(el).opacity))
      await page.waitForTimeout(200)
    }
    expect(seen.size, `opacities seen: ${[...seen]}`).toBeGreaterThan(3)
    gate.release()
    await ctx.close()
  })
}
