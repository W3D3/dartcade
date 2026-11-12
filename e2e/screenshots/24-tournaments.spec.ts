import { test, expect } from '@playwright/test'
import { VIEW, api, open, openHash, shot, userId } from './helpers.js'

// The Tournaments page shell (Tournaments, Tournaments-Phone boards): Browse and My tournaments
// empty for an admin, who has tournaments.enabled by default, and the dimmed nav item for a player
// without it.
for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const) {
  for (const tab of ['browse', 'mine'] as const) {
    test(`tournaments: ${tab} ${name}`, async ({ browser }) => {
      const s = await open(browser, 'admin', view)
      await openHash(s.page, `/tournaments/${tab}`)
      await expect(s.page.getByRole('heading', { name: /yet/i })).toBeVisible()
      await shot(s.page, `tournaments/${tab}-${name}.png`)
    })
  }
}

test('tournaments: flag off desktop', async ({ browser }) => {
  const s = await open(browser, 'luke', VIEW.wide)
  await openHash(s.page, '/tournaments')
  await expect(s.page.getByText("Tournaments aren't available yet.")).toBeVisible()
  await shot(s.page, 'tournaments/flag-off-desktop.png')
})

// Named teams (Tournaments-Teams, Team-Create, Tournaments' Your teams): the admin captains Double
// Agents (Phil and Michael joined, Gerwyn invited), plays in Phil's Checkout Crew, and has an invite
// from Gerwyn to Bullseye Bandits. Tournaments are turned on for everyone but Luke.
test('tournaments: teams', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const [phil, michael, gerwyn] = await Promise.all((['phil', 'michael', 'gerwyn'] as const).map(w => open(browser, w, VIEW.wide)))
  const ids = Object.fromEntries(
    await Promise.all(Object.entries({ admin, phil, michael, gerwyn }).map(async ([w, s]) => [w, await userId(s.page)] as const)),
  )
  await api(admin.page).put('/api/admin/flags/tournaments.enabled', { mode: 'users', userIds: Object.values(ids) })

  const make = async (page: typeof admin.page, body: object) => ((await api(page).post('/api/teams', body)) as { id: string }).id
  const joinAll = async (page: typeof admin.page) => {
    const { invites } = (await api(page).get('/api/teams')) as { invites: { id: string }[] }
    for (const i of invites) await api(page).post(`/api/team-invites/${i.id}/accept`)
  }
  // Friends, for New team's picker (a second request accepts the first; on a reused stack both are refused)
  for (const [w, s] of [
    ['phil', phil],
    ['michael', michael],
    ['gerwyn', gerwyn],
  ] as const) {
    await api(admin.page).tryPost('/api/friends/requests', { name: w })
    await api(s.page).tryPost('/api/friends/requests', { name: 'admin' })
  }
  // A reused stack (SCREENSHOTS_REUSE=1) has the teams already
  if (((await api(admin.page).get('/api/teams')) as { teams: unknown[] }).teams.length === 0) {
    await make(admin.page, { name: 'Double Agents', tag: 'DA', color: '#9b7bff', invite: [ids.phil, ids.michael] })
    await joinAll(phil.page)
    await joinAll(michael.page)
    const da = ((await api(admin.page).get('/api/teams')) as { teams: { id: string }[] }).teams[0].id
    await api(admin.page).post(`/api/teams/${da}/invites`, { userId: ids.gerwyn })
    await make(phil.page, { name: 'Checkout Crew', tag: 'CC', color: '#ff8a4a', invite: [ids.admin] })
    await joinAll(admin.page)
    await make(gerwyn.page, { name: 'Bullseye Bandits', tag: 'BB', color: '#4fd1c5', invite: [ids.admin] })
  }

  await openHash(admin.page, '/tournaments/teams')
  await expect(admin.page.getByRole('heading', { name: /Double Agents/ })).toBeVisible()
  await expect(admin.page.getByText(/invited you to join/)).toBeVisible()
  await shot(admin.page, 'tournaments/teams-desktop.png')

  await admin.page.getByRole('button', { name: 'New team' }).first().click()
  const dialog = admin.page.getByRole('dialog')
  await dialog.getByLabel('Team name').fill('Treble Makers')
  await dialog.getByLabel('Tag').fill('TM')
  await dialog.getByLabel('Blue').check({ force: true })
  await dialog.getByRole('button', { name: 'Invite Michael' }).click()
  await expect(dialog.getByRole('button', { name: 'Create team & invite 1' })).toBeVisible()
  await expect(dialog.getByText('How others see it')).toBeVisible()
  await shot(admin.page, 'tournaments/team-create-desktop.png')

  await openHash(admin.page, '/tournaments/browse')
  await expect(admin.page.getByRole('heading', { name: 'Your teams' })).toBeVisible()
  await shot(admin.page, 'tournaments/browse-teams-desktop.png')

  const phone = await open(browser, 'admin', VIEW.phone)
  await openHash(phone.page, '/tournaments/teams')
  await expect(phone.page.getByRole('heading', { name: /Double Agents/ })).toBeVisible()
  await shot(phone.page, 'tournaments/teams-phone.png')
  await phone.page.getByRole('heading', { name: /Double Agents/ }).scrollIntoViewIfNeeded()
  await shot(phone.page, 'tournaments/team-detail-phone.png')
  await phone.page.getByRole('button', { name: 'New team' }).first().click()
  await phone.page.getByRole('dialog').getByLabel('Team name').fill('Treble Makers')
  await phone.page.getByRole('dialog').getByLabel('Tag').fill('TM')
  await shot(phone.page, 'tournaments/team-create-phone.png')
})
