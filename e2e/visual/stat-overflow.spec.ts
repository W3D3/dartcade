// No player card lets its content (the stat row above all) leave the card, at any real viewport width,
// with real numbers in it (averages, darts, checkout). Runs on the visual stack (scripts/visual.sh).
import { test, expect } from '@playwright/test'

const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}` }
const SIZES = [
  [320, 568],
  [320, 640],
  [360, 740],
  [360, 800],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [568, 320],
  [740, 360],
  [844, 390],
  [600, 960],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1366, 768],
  [1920, 1080],
] as const
// Four visits: the Darts cell reaches two digits (13 with the running visit's dart), the averages 3 digits
const PLAY = [
  'Treble 20',
  'Treble 20',
  'Treble 20',
  'next',
  'Single 20',
  'Single 5',
  'Single 1',
  'next',
  'Single 20',
  'Single 5',
  'Single 1',
  'next',
  'Single 20',
  'Single 5',
  'Single 1',
  'next',
  'Single 20',
]

// The active card's height in the original single-row layout (before #494), measured at these sizes with this
// spec's visits: the paged card must stay no taller, which is the point of #495 (more room for the board)
const ORIGINAL_CARD_HEIGHT: Record<string, number> = {
  '320x640': 167,
  '360x740': 167,
  '360x800': 241,
  '390x844': 241,
  '412x915': 241,
  '768x1024': 354,
}

// 5 is a 2v2 team game
for (const players of [1, 2, 4, 5]) {
  for (const [width, height] of SIZES) {
    test(`${players === 5 ? 'teams' : `${players}p`} ${width}x${height}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      expect((await page.request.post('/api/auth/sign-in/email', { data: ACCOUNT, headers: HEADERS })).ok()).toBeTruthy()
      for (const s of (
        (await (await page.request.get('/api/sessions', { headers: HEADERS })).json()) as { sessions: { id: string; status: string }[] }
      ).sessions)
        if (s.status === 'active') await page.request.delete(`/api/sessions/${s.id}`, { headers: HEADERS })
      const { modes } = (await (await page.request.get('/api/gamemodes', { headers: HEADERS })).json()) as {
        modes: { id: string; defaultConfig: object }[]
      }
      const teams = players === 5 ? { format: 'teams', teams: [0, 1, 0, 1] } : {}
      const config = { ...modes.find(m => m.id === 'x01')!.defaultConfig, bullOff: 'off', ...teams }
      const names = ['Alexandra-Maximiliana', 'Bo', 'Cleo', 'Dan'].slice(0, Math.min(players, 4))
      const res = await page.request.post('/api/sessions', {
        headers: HEADERS,
        data: { boardId: null, gameId: 'x01', config, players: names.map(name => ({ name })) },
      })
      expect(res.ok()).toBeTruthy()
      const { sessionId } = (await res.json()) as { sessionId: string }
      try {
        await page.goto(`/#/session/${sessionId}`)
        await expect(page.getByRole('button', { name: /^End( game)?$/ })).toBeVisible({ timeout: 15_000 })
        // Averages need darts thrown: enter them on the keypad when the screen has one, else the board
        // Landscape phones hide the entry controls: they are checked with the placeholders instead
        for (const step of PLAY) {
          if (height < 500) break
          if (step === 'next') await page.getByRole('button', { name: 'Next player' }).click({ timeout: 3000 })
          else {
            const [ring] = step.split(' ')
            if (ring !== 'Single') await page.getByRole('button', { name: ring, exact: true }).click({ timeout: 3000 })
            await page.click(`button[aria-label="${step}"]`, { timeout: 3000 })
          }
        }
        const escapes = () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('section[aria-label]')].flatMap(card => {
              const c = card.getBoundingClientRect()
              return [...card.querySelectorAll<HTMLElement>('*')]
                .filter(el => el.getClientRects().length && getComputedStyle(el).position !== 'absolute')
                .filter(el => {
                  const r = el.getBoundingClientRect()
                  return r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1)
                })
                .map(
                  el =>
                    `${card.ariaLabel} (${Math.round(c.width)}px wide): ${el.tagName}.${String(el.className).slice(0, 60)} ${el.textContent?.trim().slice(0, 20)} ends ${Math.round(el.getBoundingClientRect().right - c.right)}px past`,
                )
            }),
          )
        const cardHeights = () =>
          page.evaluate(() => [...document.querySelectorAll('section[aria-label]')].map(c => Math.round(c.getBoundingClientRect().height)))
        // Phones enter darts on a keypad, which hides the stat strip: show the board view for the strip checks
        const toBoard = page.getByRole('button', { name: 'Enter darts on the board' })
        if (await toBoard.isVisible()) {
          expect(await escapes()).toEqual([])
          await toBoard.click()
        }
        expect(await escapes()).toEqual([])

        // The paged stat strip (not in the 3+ player rows): the same height on both pages, nothing out of the card on either
        const strips = page.locator('[data-stat-row]:visible')
        if (await strips.count()) {
          const first = strips.first()
          const before = await cardHeights()
          const original = ORIGINAL_CARD_HEIGHT[`${width}x${height}`]
          if (original && players < 3) expect(before[0], 'paged card no taller than the original layout').toBeLessThanOrEqual(original)
          const heights = await first.locator('[data-stat-page]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
          expect(new Set(heights).size).toBe(1)
          // Nothing is clipped by the strip: every stat sits inside its page, vertically and horizontally
          const clipped = await first.locator('[data-stat-page]').evaluateAll(pages =>
            pages.flatMap(pg => {
              const r = pg.getBoundingClientRect()
              return [...pg.querySelectorAll('[data-stat]')]
                .filter(el => el.getBoundingClientRect().bottom > r.bottom + 1 || el.getBoundingClientRect().right > r.right + 1)
                .map(el => el.textContent)
            }),
          )
          expect(clipped).toEqual([])

          // One-line labels never run into the next column, and the three columns are equal and line up on both pages
          const layout = await first
            .locator('[data-stat-page]')
            .evaluateAll(pages =>
              pages.map(pg =>
                [...pg.querySelectorAll<HTMLElement>('[data-stat]')].map(el => [
                  el.getBoundingClientRect().left,
                  el.getBoundingClientRect().width,
                  el.firstElementChild!.scrollWidth - el.clientWidth,
                ]),
              ),
            )
          // [left, column width, label overflow in px]: none may overflow (1px is the last letter's tracking)
          expect(layout.flat().filter(c => c[2] > 1)).toEqual([])
          const near = (a: number, b: number) => Math.abs(a - b) <= 1
          expect(layout.every(cols => cols.every((c, i) => near(c[1], cols[0][1]) && near(c[0], layout[0][i][0])))).toBe(true)
          await first.getByRole('button', { name: 'Stats page 1' }).click()
          await expect(first.getByRole('button', { name: 'Stats page 1' })).toHaveAttribute('aria-current', 'true')

          // A click on the strip turns the page; the dots work from the keyboard
          await first.locator('[data-stat]').first().click()
          await expect(first.getByRole('button', { name: 'Stats page 2' })).toHaveAttribute('aria-current', 'true')
          await expect(first.getByText('Best leg')).toBeInViewport()
          expect(await escapes()).toEqual([])
          expect(await cardHeights()).toEqual(before)
          await first.getByRole('button', { name: 'Stats page 1' }).focus()
          await page.keyboard.press('Enter')
          await expect(first.getByRole('button', { name: 'Stats page 1' })).toHaveAttribute('aria-current', 'true')
          await first.getByRole('button', { name: 'Stats page 2' }).focus()
          await page.keyboard.press('Enter')
          await expect(first.getByRole('button', { name: 'Stats page 2' })).toHaveAttribute('aria-current', 'true')

          // A new dart does not reset the page (phones in board view have no keypad to throw it from)
          const keypadDart = page.locator('button[aria-label="Single 5"]')
          if (await keypadDart.count()) {
            await keypadDart.click()
            await expect(first.getByRole('button', { name: 'Stats page 2' })).toHaveAttribute('aria-current', 'true')
          }
        }
      } finally {
        await page.request.delete(`/api/sessions/${sessionId}`, { headers: HEADERS })
        await ctx.close()
      }
    })
  }
}
