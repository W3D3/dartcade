import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import path from 'path'
import { root } from './compose.js'

export const BASE = 'http://localhost:5181'

/** The dev accounts the backend seeds with NODE_ENV=development (backend/src/auth/seed.ts). */
export type Who = 'admin' | 'luke' | 'phil' | 'michael' | 'gerwyn'
const PASSWORD: Record<Who, string> = {
  admin: 'admin1234',
  luke: 'darts1234',
  phil: 'darts1234',
  michael: 'darts1234',
  gerwyn: 'darts1234',
}

/** Viewports: CSS size and pixel ratio, so each PNG comes out at the size its file name or folder has always had. */
export const VIEW = {
  /** docs/tablet: 1:1, the size in the file name */
  tablet: { width: 1180, height: 820, scale: 1 },
  tabletPortrait: { width: 820, height: 1180, scale: 1 },
  tablet1024: { width: 1024, height: 768, scale: 1 },
  tablet1024Short: { width: 1024, height: 730, scale: 1 },
  /** 2160×1350 */
  desktop: { width: 1080, height: 675, scale: 2 },
  /** 2160×1500 */
  desktopTall: { width: 1080, height: 750, scale: 2 },
  /** 2880×1800 */
  wide: { width: 1440, height: 900, scale: 2 },
  /** 1650×1200 */
  narrow: { width: 825, height: 600, scale: 2 },
  /** 1770×1230 */
  tabletHiDpi: { width: 1180, height: 820, scale: 1.5 },
  /** Centred dialogs (md and up), shot on their own */
  dialog: { width: 800, height: 1000, scale: 2 },
  /** 780×1688 */
  phone: { width: 390, height: 844, scale: 2 },
  /** 720×1280 */
  smallPhone: { width: 360, height: 640, scale: 2 },
} as const
export type View = (typeof VIEW)[keyof typeof VIEW]

export type Session = { ctx: BrowserContext; page: Page }

/** A browser context at this viewport, signed in as a dev account (or signed out with null). */
export async function open(browser: Browser, who: Who | null, view: View): Promise<Session> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.scale,
    hasTouch: view.width < 500,
    isMobile: view.width < 500,
    timezoneId: 'Europe/Vienna',
    locale: 'en-GB',
  })
  const page = await ctx.newPage()
  if (who) {
    const res = await page.request.post('/api/auth/sign-in/email', {
      data: { email: `${who}@dartcade.local`, password: PASSWORD[who] },
      headers: { Origin: BASE },
    })
    expect(res.ok(), `sign-in as ${who}: ${res.status()}`).toBeTruthy()
  }
  return { ctx, page }
}

/** The REST API as the page's user (its cookies; Origin for better-auth's CSRF check). */
export function api(page: Page) {
  const headers = { Origin: BASE }
  const check = async (what: string, res: Awaited<ReturnType<Page['request']['get']>>) => {
    expect(res.ok(), `${what}: ${res.status()} ${await res.text()}`).toBeTruthy()
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  return {
    get: async (url: string) => check(`GET ${url}`, await page.request.get(url, { headers })),
    post: async (url: string, data: object = {}) => check(`POST ${url}`, await page.request.post(url, { data, headers })),
    patch: async (url: string, data: object) => check(`PATCH ${url}`, await page.request.patch(url, { data, headers })),
    /** Status only, for calls allowed to fail (leaving a lobby you aren't in). */
    tryPost: async (url: string, data: object = {}) => (await page.request.post(url, { data, headers })).status(),
  }
}

export async function userId(page: Page): Promise<string> {
  const session = (await api(page).get('/api/auth/get-session')) as { user: { id: string } }
  return session.user.id
}

export type LobbyRef = { id: string; name: string; code: string }

/** Ends any game this user still has running (a scene that failed half-way leaves one, and it blocks lobbies). */
export async function endActiveGames(page: Page): Promise<void> {
  const { sessions } = (await api(page).get('/api/sessions')) as { sessions: { id: string; status: string }[] }
  for (const s of sessions.filter(s => s.status === 'active')) {
    await openHash(page, `/session/${s.id}`)
    const end = page.getByRole('button', { name: 'End', exact: true })
    if (
      await end.waitFor({ timeout: 8000 }).then(
        () => true,
        () => false,
      )
    )
      await endGame(page)
  }
}

/** Out of any lobby: the host closes it, anyone else leaves. A running game must be ended first. */
export async function leaveLobby(page: Page): Promise<void> {
  const res = await page.request.get('/api/lobbies/current', { headers: { Origin: BASE } })
  if (res.status() !== 200) return
  const text = await res.text()
  if (!text || text === 'null') return
  const lobby = JSON.parse(text) as LobbyRef
  const a = api(page)
  if ((await a.tryPost(`/api/lobbies/${lobby.id}/close`)) >= 300) await a.tryPost(`/api/lobbies/${lobby.id}/leave`)
}

/** A new lobby hosted by this page's user, named, with its next game. */
export async function hostLobby(page: Page, name: string, nextGame: { gameId: string; config: object } | null = null): Promise<LobbyRef> {
  await endActiveGames(page)
  await leaveLobby(page)
  const a = api(page)
  const lobby = (await a.post('/api/lobbies')) as LobbyRef
  await a.patch(`/api/lobbies/${lobby.id}`, nextGame ? { name, nextGame } : { name })
  return { ...lobby, name }
}

export async function joinLobby(page: Page, lobby: LobbyRef): Promise<void> {
  await endActiveGames(page)
  await leaveLobby(page)
  await api(page).post(`/api/lobbies/${lobby.id}/join`, { code: lobby.code })
}

/** A guest at the host's board (manual entry: dev users have no online board), or a bot. */
export async function addGuest(page: Page, lobby: LobbyRef, name: string): Promise<void> {
  await api(page).post(`/api/lobbies/${lobby.id}/people`, { name, boardId: null })
}
export async function addBot(page: Page, lobby: LobbyRef, level: number): Promise<void> {
  await api(page).post(`/api/lobbies/${lobby.id}/people`, { name: `Level ${level}`, bot: { level } })
}

export const X01 = (config: object = {}) => ({
  gameId: 'x01',
  config: {
    startScore: 501,
    inMode: 'straight',
    outMode: 'double',
    bullOff: 'off',
    bullValue: '25_50',
    maxRounds: 50,
    firstTo: 3,
    format: 'singles',
    ...config,
  },
})

/** Opens a hash route as a fresh page load: a hash change alone keeps what the page had open (its lobby, its game's socket). */
export async function openHash(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`)
  await page.reload()
}

/** Starts the lobby's game (forced: nobody has to be ready) and opens it on the host's page. */
export async function startLobbyGame(page: Page, lobby: LobbyRef): Promise<string> {
  const { sessionId } = (await api(page).post(`/api/lobbies/${lobby.id}/start`, { force: true })) as { sessionId: string }
  await openHash(page, `/session/${sessionId}`)
  return sessionId
}

/** Ends the game the page shows (End, then confirm). */
export async function endGame(page: Page): Promise<void> {
  // dispatched, not clicked: a sheet over the game (a hole's scorecard) would take the click
  await page.getByRole('button', { name: 'End', exact: true }).dispatchEvent('click')
  await page.getByRole('dialog').getByRole('button', { name: 'End game' }).click()
  await page.waitForURL(url => !url.hash.startsWith('#/session/'))
}

/** Manual entry: a dart by its label ("T20", "D16", "S5", "BULL", "25", "MISS"). */
export async function dart(page: Page, label: string): Promise<void> {
  const m = /^([SDT])(\d+)$/.exec(label)
  if (m) {
    const name = { S: 'Single', D: 'Double', T: 'Treble' }[m[1] as 'S' | 'D' | 'T']
    await page.getByRole('button', { name, exact: true }).click()
    await page.click(`button[aria-label="${name} ${m[2]}"]`)
    return
  }
  await page.getByRole('button', { name: label === 'MISS' ? 'Miss' : label, exact: true }).click()
}

/** Shows the manual keypad ("Enter") or the board ("Board") in the match header. */
export async function entryMode(page: Page, mode: 'Board' | 'Enter'): Promise<void> {
  const tab = page
    .getByRole('button', { name: mode, exact: true })
    .or(page.getByRole('tab', { name: mode, exact: true }))
    .first()
  if (await tab.isVisible().catch(() => false)) await tab.click()
}

/** The account menu, from the sidebar, rail or header (whichever this width shows). */
export async function openAccountMenu(page: Page): Promise<void> {
  await closeToasts(page)
  await page
    .getByRole('button', { name: /^Account: / })
    .locator('visible=true')
    .first()
    .click()
  await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible()
}

/** Closes the lobby invite toast (the invite stays in Invites). */
export async function closeToasts(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: /^Close\. The invite stays/ })
  for (
    let i = 0;
    i < 3 &&
    (await close
      .first()
      .isVisible()
      .catch(() => false));
    i++
  )
    await close.first().click()
  // The "Connect your board" card, for accounts without a board
  const hide = page.getByRole('button', { name: 'Hide for now' })
  if (
    await hide
      .first()
      .isVisible()
      .catch(() => false)
  )
    await hide.first().click()
}

/** The dev-only account switcher (DevUserSwitch) isn't part of the product: hide it. */
async function hideDevOnly(page: Page): Promise<void> {
  await page
    .getByText(/^Dev: (switch to|sign in as)$/i)
    .locator('..')
    .evaluateAll(els => els.forEach(el => ((el as HTMLElement).style.display = 'none')))
}

export const docPath = (file: string) => path.join(root, 'docs', file)

/** Writes docs/<file> once the page has settled: fonts loaded, no spinner, animations finished. */
export async function shot(
  page: Page,
  file: string,
  opts: { fullPage?: boolean; keepToasts?: boolean; animations?: 'allow' | 'disabled'; settle?: number } = {},
): Promise<void> {
  if (!opts.keepToasts) await closeToasts(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await expect(page.locator('[aria-busy="true"]'))
    .toHaveCount(0, { timeout: 10_000 })
    .catch(() => undefined)
  await hideDevOnly(page)
  const vp = page.viewportSize()
  if (vp) await page.mouse.move(vp.width - 2, vp.height - 2)
  await page.waitForTimeout(opts.settle ?? 600)
  await page.screenshot({ path: docPath(file), fullPage: opts.fullPage, animations: opts.animations ?? 'disabled', caret: 'hide' })
}
