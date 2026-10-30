// Every game mode's match screen, compared with its image in __screenshots__ (scripts/visual.sh).
// Each scene starts a fresh local game (no board) with fixed player names, opens it in a fresh
// browser context (so the saved board-or-keypad choice can't leak between scenes) and ends it.
import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

/** Created and made admin by scripts/visual.sh: the game modes behind flags are on for admins. */
const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}` }
const NAMES = ['Anna', 'Ben', 'Cleo', 'Dan']
const VIEW = {
  desktop: { width: 1180, height: 820 },
  narrow: { width: 1000, height: 760 },
  phone: { width: 390, height: 844 },
  portrait: { width: 820, height: 1180 },
} as const
type View = keyof typeof VIEW
type Scene = { mode: string; players: number; view: View; keypad?: boolean; config?: object; name?: string }

const MODES = ['x01', 'atc', 'p121', 'hilo', 'minigolf']
const SCENES: Scene[] = [
  ...MODES.flatMap((mode): Scene[] => [
    { mode, players: 2, view: 'desktop' },
    { mode, players: 3, view: 'desktop' },
    { mode, players: 2, view: 'phone' },
    { mode, players: 2, view: 'portrait' },
  ]),
  // Minigolf has no keypad: it putts by aiming
  ...MODES.filter(m => m !== 'minigolf').map((mode): Scene => ({ mode, players: 2, view: 'desktop', keypad: true })),
  ...['x01', 'atc', 'p121'].map((mode): Scene => ({ mode, players: 1, view: 'desktop' })),
  { mode: 'x01', players: 2, view: 'narrow' },
  { mode: 'x01', players: 4, view: 'desktop', config: { format: 'teams', teams: [0, 1, 0, 1] }, name: 'x01-teams-desktop' },
]
const sceneName = (s: Scene) => s.name ?? `${s.mode}-${s.players}p-${s.view}${s.keypad ? '-keypad' : ''}`

async function signedIn(browser: Browser, view: View): Promise<Page> {
  const ctx = await browser.newContext({ viewport: VIEW[view], reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const res = await page.request.post('/api/auth/sign-in/email', { data: ACCOUNT, headers: HEADERS })
  expect(res.ok(), `sign-in: ${res.status()} (run scripts/visual.sh, which creates the account)`).toBeTruthy()
  return page
}

const getJson = async (page: Page, url: string) => (await page.request.get(url, { headers: HEADERS })).json()

/** Ends every game the account still has running (a failed scene leaves one, and it blocks the next). */
async function endGames(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const { sessions } = (await getJson(page, '/api/sessions')) as { sessions: { id: string; status: string }[] }
    const active = sessions.filter(s => s.status === 'active')
    if (active.length === 0) return
    for (const s of active) await page.request.delete(`/api/sessions/${s.id}`, { headers: HEADERS })
    await page.waitForTimeout(250)
  }
  throw new Error('a game is still running')
}

for (const scene of SCENES) {
  test(sceneName(scene), async ({ browser }) => {
    const page = await signedIn(browser, scene.view)
    await endGames(page)
    const { modes } = (await getJson(page, '/api/gamemodes')) as { modes: { id: string; defaultConfig: Record<string, unknown> }[] }
    const mode = modes.find(m => m.id === scene.mode)
    expect(mode, `${scene.mode} is offered`).toBeDefined()
    const config: Record<string, unknown> = { ...mode!.defaultConfig, ...scene.config }
    // No bull-off screen first: the match screen itself is what's compared
    if ('bullOff' in config) config.bullOff = 'off'
    if (scene.mode === 'minigolf') {
      const courses = (await getJson(page, '/api/minigolf/courses')) as { courses?: { id: string; published: boolean }[] }
      config.course = (courses.courses ?? []).find(c => c.published)?.id
    }
    const res = await page.request.post('/api/sessions', {
      headers: HEADERS,
      data: { boardId: null, gameId: scene.mode, config, players: NAMES.slice(0, scene.players).map(name => ({ name })) },
    })
    expect(res.ok(), `start ${sceneName(scene)}: ${res.status()} ${await res.text()}`).toBeTruthy()
    const { sessionId } = (await res.json()) as { sessionId: string }
    try {
      await page.goto(`/#/session/${sessionId}`)
      // "End" in the header, "End game" on phones
      await expect(page.getByRole('button', { name: /^End( game)?$/ })).toBeVisible()
      // A game without a board opens on the keypad: pick the view each scene shows (phones keep their default)
      const view = scene.keypad ? 'Enter' : 'Board'
      const toggle = page
        .getByRole('button', { name: view, exact: true })
        .or(page.getByRole('tab', { name: view, exact: true }))
        .first()
      if (scene.view !== 'phone' && (await toggle.isVisible())) await toggle.click()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`${sceneName(scene)}.png`)
    } finally {
      await endGames(page)
      await page.context().close()
    }
  })
}
