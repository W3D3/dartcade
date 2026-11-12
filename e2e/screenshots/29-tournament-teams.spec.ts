import { test, expect, type Page } from '@playwright/test'
import { VIEW, api, open, openHash, shot, userId, type View } from './helpers.js'

// Registering a team (Tournament-Register-Team, Tournament-Confirm-Phone, Tournaments-Teams' waiting
// card): the admin captains Double Agents with Luke and Phil, registers it for a teams-of-2 cup with
// Luke, Luke answers the request, and the admin waits on him meanwhile. Real data on the shots stack.
/** The tournaments the admin organizes that are not over. */
async function organized(admin: Page): Promise<{ id: string; name: string; status: string }[]> {
  const mine = (await api(admin).get('/api/tournaments/mine')) as {
    organizing: { tournament: { id: string; name: string; status: string } }[]
  }
  return mine.organizing.map(o => o.tournament)
}

async function prepare(admin: Page, luke: Page, phil: Page): Promise<void> {
  const ids = { admin: await userId(admin), luke: await userId(luke), phil: await userId(phil) }
  await api(admin).put('/api/admin/flags/tournaments.enabled', { mode: 'users', userIds: Object.values(ids) })
  // A reused stack keeps the team and earlier cups: cancel those, keep the team
  for (const t of await organized(admin)) if (t.status === 'open') await api(admin).post(`/api/tournaments/${t.id}/cancel`)
  const { teams } = (await api(admin).get('/api/teams')) as { teams: { name: string }[] }
  if (!teams.some(t => t.name === 'Double Agents')) {
    await api(admin).post('/api/teams', { name: 'Double Agents', tag: 'DA', color: '#9b7bff', invite: [ids.luke, ids.phil] })
    for (const page of [luke, phil]) {
      const { invites } = (await api(page).get('/api/teams')) as { invites: { id: string; team: { name: string } }[] }
      for (const i of invites.filter(i => i.team.name === 'Double Agents')) await api(page).post(`/api/team-invites/${i.id}/accept`)
    }
  }
  await api(admin).post('/api/tournaments', {
    name: 'November Doubles Cup',
    description: 'Two players per team, alternate visits.',
    access: 'public',
    gameId: 'x01',
    gameConfig: { startScore: 501, outMode: 'double' },
    format: 'double_elimination',
    teamSize: 2,
    maxEntries: 32,
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
    },
  })
  const draft = (await organized(admin)).find(t => t.name === 'November Doubles Cup' && t.status === 'draft')
  if (draft) await api(admin).post(`/api/tournaments/${draft.id}/publish`)
}

async function scene(view: View, name: string, browser: Parameters<typeof open>[0]): Promise<void> {
  const admin = await open(browser, 'admin', view)
  const luke = await open(browser, 'luke', view)
  const phil = await open(browser, 'phil', view)
  await prepare(admin.page, luke.page, phil.page)
  const page = admin.page

  // 1 · Which team?, 2 · Who plays?
  await openHash(page, '/tournaments/browse')
  const row = page.getByText('November Doubles Cup').locator('visible=true').first()
  if (name === 'desktop') await page.getByRole('button', { name: 'Register team' }).locator('visible=true').first().click()
  else {
    await row.click()
    await page.getByRole('button', { name: 'Register a team' }).click()
  }
  const dialog = page.getByRole('dialog').filter({ hasText: 'Who plays?' })
  await expect(dialog.getByRole('button', { name: 'Send request to Luke' })).toBeEnabled()
  await shot(page, `tournaments/register-team-${name}.png`)

  // Luke is asked: the toast, then the request on the Tournaments page and the confirm card
  await openHash(luke.page, '/tournaments/browse')
  await luke.page.waitForTimeout(2000)
  await dialog.getByRole('button', { name: 'Send request to Luke' }).click()
  await expect(luke.page.getByRole('button', { name: 'Dismiss' })).toBeVisible()
  await luke.page.getByRole('button', { name: 'Dismiss' }).click()
  // Luke has no board: hide its card before the dialog covers it
  const hide = luke.page.getByRole('button', { name: 'Hide for now' })
  if (await hide.first().isVisible()) await hide.first().click()
  await luke.page
    .getByRole('region', { name: /Team request/ })
    .getByRole('button', { name: 'Answer' })
    .click()
  await expect(luke.page.getByText('Play the November Doubles Cup?')).toBeVisible()
  await expect(luke.page.getByText(/confirm by/)).toBeVisible()
  await shot(luke.page, `tournaments/confirm-team-${name}.png`)

  // Meanwhile the captain waits on Luke: Teams, and Browse's row
  await openHash(page, '/tournaments/teams')
  await expect(page.getByText('Waiting on Luke for November Doubles Cup')).toBeVisible({ timeout: 15_000 })
  await shot(page, `tournaments/teams-waiting-${name}.png`)
  await openHash(page, '/tournaments/mine')
  await expect(page.getByRole('button', { name: 'Remind Luke' })).toBeVisible({ timeout: 15_000 })
  await shot(page, `tournaments/mine-team-waiting-${name}.png`)
  if (name === 'desktop') {
    await openHash(page, '/tournaments/browse')
    await expect(page.getByRole('button', { name: '1 to confirm' })).toBeVisible()
    await shot(page, 'tournaments/browse-team-waiting-desktop.png')
  }

  // I'm in: the team is registered
  await luke.page.getByRole('button', { name: 'I’m in' }).click()
  await openHash(page, '/tournaments/teams')
  await expect(page.getByText('Waiting on Luke')).toHaveCount(0)
}

test('tournaments: register a team desktop', async ({ browser }) => scene(VIEW.wide, 'desktop', browser))
test('tournaments: register a team phone', async ({ browser }) => scene(VIEW.phone, 'phone', browser))
