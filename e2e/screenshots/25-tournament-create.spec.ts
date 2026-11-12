import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot } from './helpers.js'

// Create tournament (Tournament-Create): the whole form for a team tournament with groups and a
// longer final, the same on a phone, an organizer start, the edit page of the saved draft, and the
// Average limit section switched on (the organizer's own 30-day form mocked).
// The page scrolls inside <main>, so the full-form shots use a tall viewport.

async function fillTeamsTournament(page: Page): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill('Pub Pairs Showdown')
  await page.getByLabel('Description').fill('Teams of three, group stage then knockout. Bring your partners!')
  await page.getByRole('radio', { name: /^Teams/ }).click()
  await page.getByRole('radiogroup', { name: 'Players per team' }).getByRole('radio', { name: '3' }).click()
  await page.getByRole('radio', { name: /^Groups \+ knockout/ }).click()
  await page.getByLabel('Longer final').click()
}

test('tournaments: create desktop', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  await s.page.setViewportSize({ width: 1440, height: 2700 })
  await openHash(s.page, '/tournaments/new')
  await fillTeamsTournament(s.page)
  await expect(s.page.getByText('First to 3 legs wins the match (best of 5).')).toBeVisible()
  await expect(s.page.getByRole('region', { name: 'Preview' }).getByText('TEAMS OF 3')).toBeVisible()
  await shot(s.page, 'tournaments/create-desktop.png')
})

test('tournaments: create phone', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.phone)
  await s.page.setViewportSize({ width: 390, height: 3400 })
  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Friday Open')
  await expect(s.page.getByRole('region', { name: 'Preview' }).getByText('FRIDAY OPEN', { exact: false })).toBeVisible()
  await shot(s.page, 'tournaments/create-phone.png')
})

test('tournaments: create with an organizer start, then edit the draft', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  // A reused stack keeps earlier drafts, and an owner may have only 5 unfinished tournaments
  const mine = (await api(s.page).get('/api/tournaments/mine')) as { tournaments: { id: string; status: string }[] }
  for (const t of mine.tournaments.filter(t => t.status === 'draft'))
    await s.page.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })

  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Sunday Doubles')
  const access = s.page.getByRole('radiogroup', { name: 'Who can join' })
  await expect(s.page.getByText(/Only for tournaments that aren’t public/)).toBeVisible()
  await access.getByRole('radio', { name: 'Friends' }).click()
  await s.page.getByRole('radio', { name: 'Organizers start it' }).click()
  const schedule = s.page.getByRole('region', { name: 'Schedule & rules' })
  await expect(schedule.getByText(/No set time/)).toBeVisible()
  await schedule.scrollIntoViewIfNeeded()
  await shot(s.page, 'tournaments/create-organizer-start-desktop.png')

  await s.page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(s.page.getByRole('heading', { name: 'Edit tournament' })).toBeVisible()
  await expect(s.page.getByText('Saved. Draft: only organizers see it.')).toBeVisible()
  await expect(s.page.getByLabel('Name', { exact: true })).toHaveValue('Sunday Doubles')
  await shot(s.page, 'tournaments/edit-draft-desktop.png')
})

for (const [name, view, width] of [
  ['desktop', VIEW.wide, 1440],
  ['phone', VIEW.phone, 390],
] as const) {
  test(`tournaments: create with an average limit ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await s.page.route('**/api/tournaments/form', r => r.fulfill({ json: { average: 68.4, legs: 120 } }))
    await s.page.setViewportSize({ width, height: 1100 })
    await openHash(s.page, '/tournaments/new')
    await fillTeamsTournament(s.page)
    await s.page.getByLabel('Limit who can join by average').click()
    const section = s.page.getByRole('region', { name: 'Average limit' })
    await expect(section.getByText(/your 30-day average \(68.4\) counts towards/)).toBeVisible()
    await expect(s.page.getByRole('region', { name: 'Preview' }).getByText('Team Ø 50–70')).toBeVisible()
    await section.scrollIntoViewIfNeeded()
    await shot(s.page, `tournaments/create-avg-limit-${name}.png`)
  })
}
