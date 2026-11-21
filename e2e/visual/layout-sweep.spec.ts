// Layout checks on small and unusual screens: the manual keypad keeps tappable keys, nothing
// overlaps, every player stays on screen. Set LAYOUT_SHOTS=<dir> to also save an image of each scene.
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { E2E_ORIGIN } from '../fixtures/origin.js'

const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: E2E_ORIGIN }
const NAMES = ['Maximilian-Alexander Hohenzol', 'Dart Queen', '🎯 Cleo', 'Dan', 'Eve', 'Finn', 'Gus', 'Hal']
const SIZES = {
  p320: { width: 320, height: 568 },
  p360: { width: 360, height: 740 },
  p390: { width: 390, height: 844 },
  p430: { width: 430, height: 932 },
  pland: { width: 844, height: 390 },
  t768: { width: 768, height: 1024 },
  t1024: { width: 1024, height: 768 },
  d1280: { width: 1280, height: 800 },
} as const
type Size = keyof typeof SIZES
type Scene = { mode: string; players: number; size: Size; keypad?: boolean; config?: object }

const KEYPAD_MODES = ['x01', 'cricket', 'atc', 'p121', 'hilo']
const SCENES: Scene[] = [
  ...KEYPAD_MODES.flatMap(mode =>
    (['p320', 'p360', 'p390', 'pland', 't768', 't1024'] as Size[]).map((size): Scene => ({ mode, players: 2, size, keypad: true })),
  ),
  ...(['p360', 'p390', 'pland', 't768', 't1024', 'd1280'] as Size[]).flatMap((size): Scene[] => [
    { mode: 'cricket', players: 4, size, keypad: true },
    { mode: 'cricket', players: 8, size },
    { mode: 'x01', players: 8, size },
  ]),
  { mode: 'x01', players: 2, size: 'p320' },
]
const name = (s: Scene) => `${s.mode}-${s.players}${s.keypad ? '-keypad' : ''}__${s.size}`

const getJson = async (page: Page, url: string) => (await page.request.get(url, { headers: HEADERS })).json()
async function endGames(page: Page) {
  for (let i = 0; i < 20; i++) {
    const { sessions } = (await getJson(page, '/api/sessions')) as { sessions: { id: string; status: string }[] }
    const active = sessions.filter(s => s.status === 'active')
    if (!active.length) return
    for (const s of active) await page.request.delete(`/api/sessions/${s.id}`, { headers: HEADERS })
    await page.waitForTimeout(250)
  }
}

for (const scene of SCENES) {
  test(name(scene), async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: SIZES[scene.size], reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    expect((await page.request.post('/api/auth/sign-in/email', { data: ACCOUNT, headers: HEADERS })).ok()).toBeTruthy()
    await endGames(page)
    const { modes } = (await getJson(page, '/api/gamemodes')) as { modes: { id: string; defaultConfig: Record<string, unknown> }[] }
    const config: Record<string, unknown> = { ...modes.find(m => m.id === scene.mode)!.defaultConfig, ...scene.config }
    if ('bullOff' in config) config.bullOff = 'off'
    const res = await page.request.post('/api/sessions', {
      headers: HEADERS,
      data: { boardId: null, gameId: scene.mode, config, players: NAMES.slice(0, scene.players).map(n => ({ name: n })) },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { sessionId } = (await res.json()) as { sessionId: string }
    try {
      await page.goto(`/#/session/${sessionId}`)
      await expect(page.getByRole('button', { name: /^End( game)?$/ })).toBeVisible()
      const view = scene.keypad ? 'Enter' : 'Board'
      const toggle = page
        .getByRole('button', { name: view, exact: true })
        .or(page.getByRole('tab', { name: view, exact: true }))
        .first()
      if (await toggle.isVisible()) await toggle.click()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      if (process.env.LAYOUT_SHOTS) await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}/${name(scene)}.png` })

      // Every player's score is on screen (not in a scroll), the one up and the others
      if (scene.mode === 'x01' && (scene.players <= 2 || scene.size === 't768')) {
        for (const n of NAMES.slice(0, scene.players))
          await expect(page.getByText(n, { exact: true }).first(), `${n} is on screen`).toBeInViewport()
      }
      if (scene.keypad) {
        // The keys are tappable: at least 44 px each way, not drawn over each other
        const one = page.getByRole('button', { name: /^(Single|Double|Treble) 1$/ })
        const two = page.getByRole('button', { name: /^(Single|Double|Treble) 2$/ })
        await one.scrollIntoViewIfNeeded()
        const a = (await one.boundingBox())!
        const b = (await two.boundingBox())!
        expect(a.height, 'key 1 height').toBeGreaterThanOrEqual(44)
        expect(a.width, 'key 1 width').toBeGreaterThanOrEqual(44)
        expect(b.x >= a.x + a.width - 1 || b.y >= a.y + a.height - 1, 'keys 1 and 2 are apart').toBeTruthy()
      }
      // A cricket column head stays inside its column
      if (scene.mode === 'cricket') {
        const bad = await page.evaluate(
          () =>
            [...document.querySelectorAll('thead th')].filter(th => {
              const box = th.getBoundingClientRect()
              return [...th.querySelectorAll('*')].some(el => el.getBoundingClientRect().right > box.right + 1)
            }).length,
        )
        expect(bad, 'column heads that run into the next column').toBe(0)
      }
      // No sideways scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
    } finally {
      await endGames(page)
      await ctx.close()
    }
  })
}
