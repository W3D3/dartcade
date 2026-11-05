// No player card lets its content (the stat row above all) leave the card, at any real viewport width,
// with real numbers in it (averages, darts, checkout). Runs on the visual stack (scripts/visual.sh).
import { test, expect } from '@playwright/test'

const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}` }
const SIZES = [
  [320, 568],
  [360, 740],
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
const PLAY = ['Treble 20', 'Treble 20', 'Treble 20', 'next', 'Single 20', 'Single 5', 'Single 1', 'next']

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
        const escapes = await page.evaluate(() =>
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
        expect(escapes).toEqual([])
      } finally {
        await page.request.delete(`/api/sessions/${sessionId}`, { headers: HEADERS })
        await ctx.close()
      }
    })
  }
}
