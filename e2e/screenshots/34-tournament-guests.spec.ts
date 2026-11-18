import { test, expect, type Page } from '@playwright/test'
import { VIEW, api, open, openHash, shot, userId, type View } from './helpers.js'

// Guest teammates (Tournament-Create's guest options, Tournament-Register-Guest): an organizer allows
// guests, a captain fills a place with one. Real data on the shots stack: the admin captains Double
// Agents (Luke and Phil) and registers it for a teams-of-2 cup that allows one guest at avg 50.

async function prepare(admin: Page, luke: Page, phil: Page): Promise<void> {
  const ids = { admin: await userId(admin), luke: await userId(luke), phil: await userId(phil) }
  await api(admin).put('/api/admin/flags/tournaments.enabled', { mode: 'users', userIds: Object.values(ids) })
  const mine = (await api(admin).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing) if (t.status === 'open') await api(admin).post(`/api/tournaments/${t.id}/cancel`)
  const { teams } = (await api(admin).get('/api/teams')) as { teams: { name: string }[] }
  if (!teams.some(t => t.name === 'Double Agents')) {
    await api(admin).post('/api/teams', { name: 'Double Agents', tag: 'DA', color: '#9b7bff', invite: [ids.luke, ids.phil] })
    for (const page of [luke, phil]) {
      const { invites } = (await api(page).get('/api/teams')) as { invites: { id: string; team: { name: string } }[] }
      for (const i of invites.filter(i => i.team.name === 'Double Agents')) await api(page).post(`/api/team-invites/${i.id}/accept`)
    }
  }
  const made = (await api(admin).post('/api/tournaments', {
    name: 'Pub Pairs Showdown',
    description: 'Two players per team. Bring a mate, or a guest.',
    play: 'online',
    preselected: false,
    visibility: 'public',
    gameId: 'x01',
    gameConfig: { startScore: 501, outMode: 'double' },
    format: 'single_elimination',
    teamSize: 2,
    maxEntries: 16,
    startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    settings: {
      seeding: 'random',
      firstTo: 3,
      longerFinal: null,
      groups: null,
      registrationClosesMinutes: 180,
      checkInMinutes: 30,
      plannedFor: null,
      manualScoring: true,
      noShowMinutes: 10,
      avgLimit: null,
      guests: { perTeam: 1, average: 50 },
    },
  })) as { id: string }
  await api(admin).post(`/api/tournaments/${made.id}/publish`)
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as [string, View][]) {
  test(`tournaments: register with a guest ${name}`, async ({ browser }) => {
    const admin = await open(browser, 'admin', view)
    const luke = await open(browser, 'luke', view)
    const phil = await open(browser, 'phil', view)
    await prepare(admin.page, luke.page, phil.page)
    const page = admin.page
    await openHash(page, '/tournaments/browse')
    const row = page.getByText('Pub Pairs Showdown').locator('visible=true').first()
    if (name === 'desktop') await page.getByRole('button', { name: 'Register team' }).locator('visible=true').first().click()
    else {
      await row.click()
      await page.getByRole('button', { name: 'Register a team' }).click()
    }
    const dialog = page.getByRole('dialog').filter({ hasText: 'Who plays?' })
    // The captain plays with a guest instead of Luke
    await dialog.getByRole('checkbox', { name: /Luke/ }).click()
    await dialog.getByRole('button', { name: /Play with a guest/ }).click()
    await dialog.getByLabel('Guest 1 name').fill('Papa')
    await expect(dialog.getByRole('button', { name: 'Register team' })).toBeEnabled()
    await shot(page, `tournaments/register-guest-${name}.png`)
  })
}

test('tournaments: create with guest options', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  await s.page.setViewportSize({ width: 1440, height: 1100 })
  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Pub Pairs Showdown')
  await s.page.getByRole('radio', { name: /^Teams/ }).click()
  await s.page.getByLabel('Allow guest players').click()
  await expect(s.page.getByRole('region', { name: 'Preview' }).getByText('GUESTS OK')).toBeVisible()
  await s.page.getByText('Guests per team').scrollIntoViewIfNeeded()
  await shot(s.page, 'tournaments/create-guests-desktop.png')
})
