import { execFileSync } from 'child_process'
import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'
import { root } from './compose.js'

// Claiming a spot from its link (Tournament-Claim-Phone, #/tournaments/claim/:code). Two matches
// are written to the database so the page has a "Played so far".

const sql = (query: string) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.e2e.yaml',
      '-f',
      'e2e/docker-compose.screenshots.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'dartgames',
      '-d',
      'dartgames',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { cwd: root, stdio: 'inherit' },
  )

async function clearMine(page: Page): Promise<void> {
  const mine = (await api(page).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing) {
    if (t.status === 'draft') await page.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })
    else if (t.status === 'open') await api(page).post(`/api/tournaments/${t.id}/cancel`)
  }
}

async function setUp(page: Page): Promise<string> {
  await clearMine(page)
  const t = (await api(page).post('/api/tournaments', {
    name: 'Anchor Pub League · Week 3',
    description: '',
    access: 'in_person',
    gameId: 'x01',
    gameConfig: { startScore: 501, outMode: 'double' },
    format: 'round_robin',
    teamSize: 1,
    maxEntries: 16,
    startsAt: null,
    settings: {
      seeding: 'random',
      firstTo: 3,
      longerFinal: null,
      groups: null,
      registrationClosesMinutes: null,
      checkInMinutes: null,
      plannedFor: '2026-11-28T18:00:00.000Z',
      manualScoring: true,
      noShowMinutes: null,
      avgLimit: null,
    },
  })) as { id: string }
  await api(page).post(`/api/tournaments/${t.id}/publish`)
  const names = ['Chris', 'Ben', 'Jule', 'Marco']
  const list = (await api(page).put(`/api/tournaments/${t.id}/participants`, {
    entries: names.map(name => ({ name, tag: null, color: null, players: [{ name }] })),
  })) as { entries: { id: string; name: string; players: { claimCode: string }[] }[] }
  const id = (n: string) => `(SELECT id FROM tournament_entries WHERE tournament_id = '${t.id}' AND name = '${n}')`
  const match = (round: number, vs: string, winner: string | null, a: number, b: number) =>
    `INSERT INTO tournament_matches (id, tournament_id, bracket, round, slot, entry_a_id, entry_b_id, first_to, status, outcome, winner_entry_id, legs_a, legs_b)
     VALUES (gen_random_uuid(), '${t.id}', 'main', ${round}, 0, ${id('Chris')}, ${id(vs)}, 3, '${winner ? 'finished' : 'ready'}', ${winner ? "'played'" : 'NULL'}, ${winner ? id(winner) : 'NULL'}, ${a}, ${b})`
  sql([match(1, 'Ben', 'Chris', 3, 1), match(2, 'Jule', 'Jule', 1, 3), match(3, 'Marco', null, 0, 0)].join(';'))
  return list.entries.find(e => e.name === 'Chris')!.players[0].claimCode
}

test('tournaments: claim a spot on a phone and on a desktop', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.phone)
  const code = await setUp(s.page)
  await openHash(s.page, `/tournaments/claim/${code}`)
  await expect(s.page.getByRole('button', { name: /^Claim as @/ })).toBeVisible()
  await shot(s.page, 'tournaments/claim-phone.png')

  await s.page.setViewportSize({ width: 1440, height: 900 })
  await shot(s.page, 'tournaments/claim-desktop.png')

  await s.page.setViewportSize(VIEW.phone)
  await s.page.getByRole('button', { name: /^Claim as @/ }).click()
  await expect(s.page.getByRole('heading', { name: 'Spot claimed' })).toBeVisible()
  await shot(s.page, 'tournaments/claim-done-phone.png')
})
