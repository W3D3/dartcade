import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { VIEW, endActiveGames, hostLobby, joinLobby, open, shot, userId, X01, type View } from './helpers.js'

// A duo's lobby while its ranked search runs: the search is added to the /ws/me socket's messages
// (the stack has no queue). RANKED_LOBBY_PREFIX names the files ("before-"), to shoot the same
// scenes on another build.
const PREFIX = process.env.RANKED_LOBBY_PREFIX ?? ''
const DIR = 'ranked-lobby'

/** The viewer marks their own row ready on the lobby page, as a duo about to queue is (a guest follows whoever added them). */
async function ready(page: Page) {
  await page.goto('/#/lobby')
  await page.reload()
  const toggle = page.getByRole('button', { name: /Mark as ready/ })
  await expect(toggle.first()).toBeVisible()
  for (const b of await toggle.all()) await b.click()
  await expect(page.getByRole('button', { name: /Mark as ready/ })).toHaveCount(0)
}

async function searching(page: Page, hostUserId: string, players: string[]) {
  const search = {
    mode: '2v2',
    firstTo: 2,
    since: new Date(Date.now() - 71_000).toISOString(),
    range: 75,
    rating: 1226,
    hostUserId,
    players,
    searching: 38,
  }
  await page.routeWebSocket(/\/ws\/me/, ws => {
    const server = ws.connectToServer()
    ws.onMessage(m => server.send(m))
    server.onMessage(m => {
      ws.send(m)
      ws.send(JSON.stringify({ type: 'matchmaking', pausedUntil: null, search, match: null }))
    })
  })
}

/** Admin hosts a ranked duo with Luke, both ready (a lobby with only guests is solo, where ready means nothing). */
async function duo(browser: Browser, hostView: View, partnerView: View) {
  const host = await open(browser, 'admin', hostView)
  const lobby = await hostLobby(host.page, 'Ranked duo', X01({ format: 'teams' }))
  const partner = await open(browser, 'luke', partnerView)
  await joinLobby(partner.page, lobby)
  await ready(host.page)
  await ready(partner.page)
  const hostId = await userId(host.page)
  await searching(host.page, hostId, ['Admin', 'Luke'])
  await searching(partner.page, hostId, ['Admin', 'Luke'])
  return { host, partner }
}

test('the duo lobby while it searches, host on a desktop', async ({ browser }) => {
  const { host, partner } = await duo(browser, VIEW.wide, VIEW.phone)
  await host.page.goto('/#/lobby')
  await host.page.reload()
  await expect(host.page.getByRole('region', { name: 'People in this lobby' })).toBeVisible()
  await shot(host.page, `${DIR}/${PREFIX}host-desktop.png`, { settle: 900 })
  await endActiveGames(host.page)
  await host.ctx.close()
  await partner.ctx.close()
})

test('the duo lobby while it searches, partner on a phone', async ({ browser }) => {
  const { host, partner } = await duo(browser, VIEW.wide, VIEW.phone)
  await partner.page.goto('/#/lobby')
  await partner.page.reload()
  await expect(partner.page.getByRole('region', { name: 'People in this lobby' })).toBeVisible()
  await shot(partner.page, `${DIR}/${PREFIX}partner-phone.png`, { settle: 900 })
  await partner.page.getByRole('region', { name: 'People in this lobby' }).scrollIntoViewIfNeeded()
  await shot(partner.page, `${DIR}/${PREFIX}partner-phone-people.png`, { settle: 400 })
  await host.ctx.close()
  await partner.ctx.close()
})
