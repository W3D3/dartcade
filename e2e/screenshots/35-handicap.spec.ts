import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { VIEW, api, dart, entryMode, hostLobby, open, openHash, shot, startLobbyGame, X01, type View, type Who } from './helpers.js'

// X01 handicaps in a lobby (lobby.handicap.enabled, on for admins): the host's cog on each row, the
// marker on a handicapped row, the match cards and the details page. "before-" is the same lobby with
// a host the flag is off for and no handicaps, which is what the lobby looked like before.
const DIR = 'handicap'
const MIA = { startScore: 101, outMode: 'straight' }
const SAM = { startScore: 301, inMode: 'double' }

/** One visit: its darts, then Next player (unless it's the visit still being thrown). */
async function visit(page: Page, darts: string[], done = true): Promise<void> {
  for (const d of darts) await dart(page, d)
  if (done) await page.getByRole('button', { name: 'Next player' }).click()
}

/** The host's lobby for a first-to-1 501: the host, Mia and Sam (guests at the host's keypad), handicapped or not. */
async function lobby(page: Page, handicaps: boolean) {
  const ref = await hostLobby(page, 'Friday darts', X01({ firstTo: 1 }))
  const a = api(page)
  for (const [name, handicap] of [
    ['Mia', MIA],
    ['Sam', SAM],
  ] as const) {
    const { id } = (await a.post(`/api/lobbies/${ref.id}/people`, { name, boardId: null })) as { id: string }
    if (handicaps) await a.patch(`/api/lobbies/${ref.id}/people/${id}`, { handicap })
  }
  return ref
}

async function lobbyShot(browser: Browser, who: Who, view: View, file: string, handicaps: boolean, openCog = false) {
  const { ctx, page } = await open(browser, who, view)
  await lobby(page, handicaps)
  await openHash(page, '/lobby')
  const people = page.getByRole('region', { name: 'People in this lobby' })
  await expect(people).toBeVisible({ timeout: 15_000 })
  await people.scrollIntoViewIfNeeded()
  if (openCog) {
    await page.getByRole('button', { name: 'Handicap for Sam' }).click()
    await expect(page.getByRole('dialog', { name: 'Handicap for Sam' })).toBeVisible()
  }
  await shot(page, `${DIR}/${file}.png`, { settle: 600 })
  await ctx.close()
}

for (const [label, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  test(`lobby before handicaps, ${label}`, async ({ browser }) => {
    await lobbyShot(browser, 'luke', view, `before-lobby-${label}`, false)
  })
  test(`lobby with handicaps, ${label}`, async ({ browser }) => {
    await lobbyShot(browser, 'admin', view, `lobby-${label}`, true)
  })
  test(`the handicap settings, ${label}`, async ({ browser }) => {
    await lobbyShot(browser, 'admin', view, `settings-${label}`, true, true)
  })
}

test('the match and the details of a handicapped game', async ({ browser }) => {
  const host = await open(browser, 'admin', VIEW.wide)
  const ref = await lobby(host.page, true)
  const session = await startLobbyGame(host.page, ref)
  await expect(host.page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible()
  await entryMode(host.page, 'Enter')
  // Admin 501 → 321; Mia 101 → 20; Sam opens on a double, 301 → 141
  await visit(host.page, ['T20', 'T20', 'T20'])
  await visit(host.page, ['T20', 'S20', 'S1'])
  await visit(host.page, ['D20', 'T20', 'T20'])
  await expect(host.page.getByText('101 · straight in · straight out').first()).toBeVisible()
  await shot(host.page, `${DIR}/match-desktop.png`, { settle: 900 })

  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, `/session/${session}`)
  await expect(phone.page.getByText('Mia').first()).toBeVisible()
  await shot(phone.page, `${DIR}/match-phone.png`, { settle: 900 })
  await phone.ctx.close()

  // Admin 321 → 141, then Mia checks out on a single (straight out)
  await visit(host.page, ['T20', 'T20', 'T20'])
  await visit(host.page, ['S20'])

  for (const [label, view] of [
    ['desktop', { width: 1440, height: 1500, scale: 1 }],
    ['phone', { width: 390, height: 1900, scale: 1 }],
  ] as const) {
    const s = await open(browser, 'admin', view)
    await openHash(s.page, `/history/${session}`)
    await expect(s.page.getByRole('list', { name: 'Handicaps' })).toBeVisible()
    await shot(s.page, `${DIR}/details-${label}.png`, { settle: 1500 })
    await s.ctx.close()
  }
  await host.ctx.close()
})
