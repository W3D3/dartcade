import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, VIEW, api, open, shot, leaveLobby } from './helpers.js'
import { TIMEOUT } from '../fixtures/timeouts.js'

// A real ranked match through the queue: nothing here is added to the sockets' messages, so what the
// screens show is what the server's snapshot (`ranked`) and `matchmaking.ended` say. The visit and the
// reserve are shortened through the flags, so the chip, the banner and the countdown can be shot in a
// minute. RANKED_REAL_DIR names the docs folder.
const DIR = process.env.RANKED_REAL_DIR ?? 'ranked-real'
const VISIT = 18
const RESERVE = 50

test.describe.configure({ mode: 'serial' })

const BULL = { name: '50', number: 50, bed: 'Double', multiplier: 1 }
const MISS = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }

/** Sends one action to the game as this page's user, over the game's own socket. */
async function act(page: Page, sessionId: string, action: object) {
  const seen = await page.evaluate(
    ([id, a]) =>
      new Promise<string[]>(resolve => {
        const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws?sessionId=${id}`)
        const seen: string[] = []
        // The socket only listens once its first snapshot came
        ws.onmessage = e => {
          const m = JSON.parse(String(e.data))
          if (m.type !== 'snapshot') {
            seen.push(String(e.data))
            return
          }
          if (seen.includes('sent')) return
          seen.push('sent')
          ws.send(JSON.stringify({ type: 'user_action', action: a }))
          setTimeout(() => {
            ws.close()
            resolve(seen)
          }, 400)
        }
      }),
    [sessionId, action] as const,
  )
  const said = seen.filter(s => s !== 'sent')
  if (said.length > 0) console.log('game socket said', said)
}

type Game = { game: { phase: string; bullOff: { currentPlayer: number } | null }; players: { name: string }[] }
const game = async (page: Page, id: string) => (await api(page).get(`/api/sessions/${id}`)) as Game

/** Out of any game and lobby: a ranked game can't be ended, so a game a failed run left is forfeited. */
async function giveUp(page: Page) {
  await page.goto('/#/')
  const { sessions } = (await api(page).get('/api/sessions')) as { sessions: { id: string; status: string }[] }
  for (const s of sessions.filter(s => s.status === 'active')) await act(page, s.id, { type: 'forfeit' })
  await leaveLobby(page)
  await page.request.delete('/api/matchmaking/search', { headers: { Origin: BASE } })
}

/** Both players search, accept the match that is found, and land on the game the server started. */
async function startMatch(a: Page, b: Page): Promise<string> {
  for (const p of [a, b]) {
    await giveUp(p)
    await api(p).post('/api/matchmaking/search', { mode: '1v1', firstTo: 2 })
  }
  for (const p of [a, b]) await expect(p.getByRole('heading', { name: 'Match found' })).toBeVisible({ timeout: 120_000 })
  for (const p of [a, b])
    await p
      .getByRole('dialog')
      .getByRole('button', { name: /^Accept/ })
      .click()
  for (const p of [a, b]) await p.waitForURL(/#\/session\//, { timeout: TIMEOUT.long })
  return a.url().split('/session/')[1]
}

/** The bull off by hand: `winner` hits the bull, the other misses. Then the game's clock starts. */
async function bullOff(pages: Record<string, Page>, id: string, winner: string) {
  for (let throws = 0; throws < 2; throws++) {
    const g = await game(pages[winner], id)
    const who = g.players[g.game.bullOff?.currentPlayer ?? 0].name
    const page = pages[who]
    await act(page, id, { type: 'add_dart', segment: who === winner ? BULL : MISS })
    await act(page, id, { type: 'takeout' })
  }
  // The screens start the game themselves a few seconds after the result
  await expect.poll(async () => (await game(pages[winner], id)).game.bullOff, { timeout: TIMEOUT.long }).toBeNull()
}

for (const [view, name] of [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`a real ranked match from the queue to the result, ${name}`, async ({ browser }) => {
    const admin = await open(browser, 'admin', view)
    const luke = await open(browser, 'luke', VIEW.desktop)
    await api(admin.page).put('/api/admin/flags/matchmaking.visitSeconds', { number: VISIT })
    await api(admin.page).put('/api/admin/flags/matchmaking.reserveSeconds', { number: RESERVE })

    const id = await startMatch(admin.page, luke.page)
    const me = ((await api(admin.page).get('/api/me')) as { name: string }).name
    const other = ((await api(luke.page).get('/api/me')) as { name: string }).name
    await bullOff({ [me]: admin.page, [other]: luke.page }, id, me)
    const started = Date.now()

    // The visit's last seconds: the turn chip
    await expect(admin.page.getByRole('timer', { name: /Time left for this visit/ })).toBeVisible()
    await shot(admin.page, `${DIR}/visit-${name}.png`, { settle: 900 })

    // The visit ran over: the reserve counts down
    await admin.page.waitForTimeout(Math.max(0, VISIT * 1000 + 2500 - (Date.now() - started)))
    await shot(admin.page, `${DIR}/reserve-${name}.png`, { settle: 600 })

    // Luke closes his screen: the countdown to his forfeit
    await luke.page.close()
    await admin.page.waitForTimeout(2500)
    await shot(admin.page, `${DIR}/away-${name}.png`, { settle: 600 })

    // Luke gives up from another tab (the same forfeit as the Forfeit button): the result
    const elsewhere = await luke.ctx.newPage()
    await elsewhere.goto('/#/')
    await act(elsewhere, id, { type: 'forfeit' })
    await expect(admin.page.getByText(/Find next match|Back to Matchmaking/).first()).toBeVisible({ timeout: TIMEOUT.medium })
    await shot(admin.page, `${DIR}/result-${name}.png`, { settle: 1500 })

    await admin.ctx.close()
    await luke.ctx.close()
  })
}

test('a declined match tells the other side', async ({ browser }) => {
  const phil = await open(browser, 'phil', VIEW.desktop)
  const gerwyn = await open(browser, 'gerwyn', VIEW.desktop)
  for (const p of [phil.page, gerwyn.page]) {
    await giveUp(p)
    await api(p).post('/api/matchmaking/search', { mode: '1v1', firstTo: 2 })
  }
  for (const p of [phil.page, gerwyn.page]) await expect(p.getByRole('heading', { name: 'Match found' })).toBeVisible({ timeout: 120_000 })
  await phil.page.getByRole('button', { name: 'Decline' }).click()
  await expect(gerwyn.page.getByText('The other side declined the match.')).toBeVisible()
  await shot(gerwyn.page, `${DIR}/declined-desktop.png`, { settle: 600, keepToasts: true })
  await gerwyn.ctx.request.delete('/api/matchmaking/search', { headers: { Origin: BASE } })
  await phil.ctx.close()
  await gerwyn.ctx.close()
})
