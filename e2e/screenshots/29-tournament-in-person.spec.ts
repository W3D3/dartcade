import { execFileSync } from 'child_process'
import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'
import { root } from './compose.js'

// In-person tournaments (Tournament-Create's Added by you and Participants, Edit team, and the
// organizer page Tournament-Onsite / -Onsite-Teams). Claiming a spot has no page yet, so two
// spots are claimed in the database for the organizer page.

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

/** An owner may have only 5 unfinished tournaments: a reused stack keeps earlier ones. */
async function clearMine(page: Page): Promise<void> {
  const mine = (await api(page).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing) {
    if (t.status === 'draft') await page.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })
    else if (t.status === 'open') await api(page).post(`/api/tournaments/${t.id}/cancel`)
  }
}

async function inPerson(page: Page, name: string, teamSize: number, format: string): Promise<string> {
  const t = (await api(page).post('/api/tournaments', {
    name,
    description: '',
    access: 'in_person',
    gameId: 'x01',
    gameConfig: { startScore: 501, outMode: 'double' },
    format,
    teamSize,
    maxEntries: 64,
    startsAt: null,
    settings: {
      seeding: 'random',
      firstTo: 3,
      longerFinal: null,
      groups: format === 'groups_knockout' ? { size: 3, through: 2 } : null,
      registrationClosesMinutes: null,
      checkInMinutes: null,
      plannedFor: '2026-11-28T18:00:00.000Z',
      manualScoring: true,
      noShowMinutes: null,
      avgLimit: null,
    },
  })) as { id: string }
  await api(page).post(`/api/tournaments/${t.id}/publish`)
  return t.id
}

const claim = (tournamentId: string, spot: string, who: string) =>
  sql(
    `UPDATE tournament_players SET user_id = (SELECT id FROM "user" WHERE email = '${who}@dartcade.local') WHERE tournament_id = '${tournamentId}' AND name = '${spot}'`,
  )

test('tournaments: create in person with teams, and Edit team', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  await clearMine(s.page)
  await s.page.setViewportSize({ width: 1440, height: 3000 })
  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Spring Club Doubles')
  await s.page.getByRole('radiogroup', { name: 'Who can join' }).getByRole('radio', { name: 'Added by you' }).click()
  await s.page.getByRole('radio', { name: /^Teams/ }).click()
  await s.page.getByRole('radiogroup', { name: 'Players per team' }).getByRole('radio', { name: '3' }).click()
  await s.page.getByRole('button', { name: 'Paste a list' }).click()
  await s.page
    .getByRole('dialog')
    .locator('textarea')
    .fill('Treble Trouble; Anna Berger; Jonas; Kim\nOche Owls; Mia K.; Paul; Ole\nBar Flies; Sven; Lea')
  await s.page.getByRole('button', { name: 'Add to the list' }).click()
  await expect(s.page.getByText('Added 3 teams.')).toBeVisible()
  await s.page.getByRole('radiogroup', { name: 'Players per team' }).getByRole('radio', { name: '2' }).click()
  await expect(s.page.getByText(/will be removed\. Their claim links stop working\./)).toBeVisible()
  await shot(s.page, 'tournaments/in-person-create-desktop.png')

  await s.page.setViewportSize(VIEW.dialog)
  await s.page.getByRole('button', { name: 'Edit Treble Trouble' }).click()
  await expect(s.page.getByRole('dialog', { name: 'Edit team' })).toBeVisible()
  await shot(s.page, 'tournaments/in-person-edit-team-dialog.png')
})

test('tournaments: create in person solo on a phone', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.phone)
  await s.page.setViewportSize({ width: 390, height: 3600 })
  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Spring Club Night')
  await s.page.getByRole('radiogroup', { name: 'Who can join' }).getByRole('radio', { name: 'Added by you' }).click()
  await s.page.getByRole('button', { name: 'Paste a list' }).click()
  await s.page.getByRole('dialog').locator('textarea').fill('Anna Berger\nJonas\nMia K.\nPaul')
  await s.page.getByRole('button', { name: 'Add to the list' }).click()
  await expect(s.page.getByText('Added 4 players.')).toBeVisible()
  await shot(s.page, 'tournaments/in-person-create-phone.png')
})

test('tournaments: organizer page, players and teams', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.desktop)
  await clearMine(s.page)
  const solo = await inPerson(s.page, 'Spring Club Night', 1, 'single_elimination')
  await api(s.page).put(`/api/tournaments/${solo}/participants`, {
    entries: ['Anna Berger', 'Jonas', 'Mia K.', 'Paul', 'Sven', 'Lea', 'Tom', 'Nico'].map(name => ({
      name,
      tag: null,
      color: null,
      players: [{ name }],
    })),
  })
  claim(solo, 'Anna Berger', 'luke')
  claim(solo, 'Lea', 'phil')

  const team = (name: string, tag: string, color: string, players: string[]) => ({
    name,
    tag,
    color,
    players: players.map(p => ({ name: p })),
  })
  const pairs = await inPerson(s.page, 'Spring Club Doubles', 2, 'groups_knockout')
  await api(s.page).put(`/api/tournaments/${pairs}/participants`, {
    entries: [
      team('Treble Trouble', 'TT', '#9b7bff', ['Anna Berger', 'Jonas']),
      team('Oche Owls', 'OWL', '#4fd1c5', ['Mia K.', 'Paul']),
      team('Bar Flies', 'BF', '#ff8a4a', ['Sven', 'Lea']),
      team('Double Dutch', 'DD', '#3fb6e8', ['Tom', 'Nico']),
      team('Ton Eighty', 'TON', '#eac24f', ['Kim', 'Ole']),
      team('Checkmates', 'CHK', '#7fd18f', ['Ida']),
    ],
  })
  claim(pairs, 'Anna Berger', 'luke')
  claim(pairs, 'Lea', 'phil')

  await openHash(s.page, `/tournaments/${solo}/manage`)
  await expect(s.page.getByText('8 · 2 claimed')).toBeVisible({ timeout: 30_000 })
  await shot(s.page, 'tournaments/in-person-organizer-desktop.png')

  await openHash(s.page, `/tournaments/${pairs}/manage`)
  await expect(s.page.getByText('6 teams · 2 of 11 claimed')).toBeVisible()
  await shot(s.page, 'tournaments/in-person-organizer-teams-desktop.png')

  const phone = await open(browser, 'admin', VIEW.phone)
  await phone.page.setViewportSize({ width: 390, height: 1900 })
  await openHash(phone.page, `/tournaments/${pairs}/manage`)
  await expect(phone.page.getByText('6 teams · 2 of 11 claimed')).toBeVisible()
  await shot(phone.page, 'tournaments/in-person-organizer-teams-phone.png')
})

test('tournaments: details for an organizer', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.dialog)
  await clearMine(s.page)
  const id = await inPerson(s.page, 'Spring Club Night', 1, 'single_elimination')
  await api(s.page).put(`/api/tournaments/${id}/participants`, {
    entries: ['Anna Berger', 'Jonas'].map(name => ({ name, tag: null, color: null, players: [{ name }] })),
  })
  await openHash(s.page, '/tournaments/browse')
  await s.page.getByRole('button', { name: 'Spring Club Night' }).first().click()
  await expect(s.page.getByRole('dialog', { name: 'Spring Club Night' })).toBeVisible()
  await shot(s.page, 'tournaments/organizer-details-dialog.png')
})
