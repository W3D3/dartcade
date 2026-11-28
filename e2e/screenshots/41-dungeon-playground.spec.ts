import { test, expect, type Page } from '@playwright/test'
import { VIEW, open, shot } from './helpers.js'

// The admin Dungeon playground (#/admin/dungeon); docs/dungeon-playground/<scene>-<size>.png. It runs the
// engine in the browser, so the only answers it needs are the signed-in admin's, mocked here: the scene
// works against any served frontend, with or without a backend.
const ME = {
  signInMethods: ['password'],
  pictures: [],
  id: 'u-admin',
  name: 'Admin',
  email: 'admin@dartcade.local',
  nameNeedsChange: false,
  suggestedName: null,
  invisible: false,
  showLastOnline: 'friends',
  friendsVisibility: 'friends',
  discoverable: true,
  isAdmin: true,
  isModerator: false,
  impersonating: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  avatar: { kind: 'none' },
  country: null,
}

async function mockAdmin(page: Page) {
  // the sockets (presence, lobby) have no server here: an open socket that says nothing
  await page.routeWebSocket(/\/(ws|bridge)\//, () => undefined)
  await page.route(
    u => u.pathname.startsWith('/api/') || u.pathname.startsWith('/ofrep'),
    r => {
      const url = new URL(r.request().url())
      if (url.pathname === '/api/me') return r.fulfill({ json: ME })
      if (url.pathname.startsWith('/ofrep')) return r.fulfill({ json: { flags: [] } })
      // everything else the shell asks for on start (boards, game modes, preferences): empty
      return r.fulfill({ json: url.pathname === '/api/boards' || url.pathname === '/api/gamemodes' ? [] : {} })
    },
  )
}

const SCENES = [
  ['desktop', { ...VIEW.wide, height: 1500 }],
  ['tablet', { ...VIEW.tablet, height: 1500 }],
] as const

for (const [name, view] of SCENES) {
  test(`the Dungeon playground, ${name}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, null, view)
    await mockAdmin(page)
    await page.goto('/#/admin/dungeon')
    const setup = page.getByRole('region', { name: 'Setup' })
    await expect(setup.getByRole('group', { name: 'Hero 1' })).toBeVisible()
    await expect(page.getByLabel('Class of hero 1')).toHaveValue('brawler')
    await shot(page, `dungeon-playground/setup-${name}.png`)

    // the Pin Cushion + Piercing Sword scenario is loaded: throw its script and read the trace
    await page.getByLabel('Throw script').fill('t20 t20 t20')
    await page.getByRole('button', { name: /^Throw script/ }).click()
    const result = page.getByRole('region', { name: 'Result' })
    await expect(result.locator('[data-id="pinCushion"]').last()).toBeVisible()
    await expect(result.locator('[data-id="piercingSword"]').last()).toBeVisible()
    await shot(page, `dungeon-playground/trace-${name}.png`)

    await result.getByRole('button', { name: 'Run enemy turn' }).click()
    await expect(result.getByRole('list', { name: 'Last enemy turn' })).toBeVisible()
    await shot(page, `dungeon-playground/enemy-turn-${name}.png`)
    await ctx.close()
  })
}

test('throwing by hand: the board and an open visit', async ({ browser }) => {
  const { ctx, page } = await open(browser, null, { ...VIEW.wide, height: 1500 })
  await mockAdmin(page)
  await page.goto('/#/admin/dungeon')
  const board = page.getByRole('region', { name: 'Throw' })
  await expect(board).toBeVisible()
  await page.getByRole('button', { name: 'Random throw' }).click()
  await page.getByLabel('Throw script').fill('d16 25 miss')
  await expect(board.getByLabel('Open visit')).toContainText('dart 3')
  await shot(page, 'dungeon-playground/throwing-desktop.png')
  await ctx.close()
})
