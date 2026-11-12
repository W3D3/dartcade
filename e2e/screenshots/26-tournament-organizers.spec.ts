import { test, expect, type Page } from '@playwright/test'
import { BASE, VIEW, api, open, openHash, shot, userId } from './helpers.js'

// Co-organizers (Tournament-Create's Organizers field, Tournament-Onsite-Organizer's card and Add an
// organizer): the admin picks Phil on the create page, saves, sees him on the card, and Michael
// gets the toast when he is added. Tournaments are on for the four accounts used here.
async function prepare(admin: Page, others: Page[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = { admin: await userId(admin) }
  for (const [name, page] of Object.entries({ phil: others[0], michael: others[1] })) ids[name] = await userId(page)
  await api(admin).put('/api/admin/flags/tournaments.enabled', { mode: 'users', userIds: Object.values(ids) })
  for (const [name, page] of Object.entries({ phil: others[0], michael: others[1] })) {
    await api(admin).tryPost('/api/friends/requests', { name })
    await api(page).tryPost('/api/friends/requests', { name: 'admin' })
  }
  // An owner may have only 5 unfinished tournaments, and a reused stack keeps earlier drafts
  const mine = (await api(admin).get('/api/tournaments/mine')) as { organizing: { tournament: { id: string; status: string } }[] }
  for (const { tournament: t } of mine.organizing.filter(o => o.tournament.status === 'draft'))
    await admin.request.delete(`/api/tournaments/${t.id}`, { headers: { Origin: BASE } })
  return ids
}

test('tournaments: organizers desktop', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.wide)
  const phil = await open(browser, 'phil', VIEW.wide)
  const michael = await open(browser, 'michael', VIEW.wide)
  const ids = await prepare(admin.page, [phil.page, michael.page])
  const page = admin.page

  await openHash(page, '/tournaments/new')
  await page.getByLabel('Name', { exact: true }).fill('Spring Club Night')
  await page.getByRole('button', { name: 'Add organizer' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Select Phil' }).click()
  await expect(dialog.getByText('Phil will be able to')).toBeVisible()
  await shot(page, 'tournaments/organizers-add-dialog-desktop.png')
  await dialog.getByRole('button', { name: 'Add Phil as organizer' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Phil' }).getByRole('button', { name: 'Remove Phil' })).toBeVisible()
  await shot(page, 'tournaments/create-organizers-desktop.png')

  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByRole('heading', { name: 'Edit tournament' })).toBeVisible()
  const card = page.getByRole('region', { name: 'Organizers' })
  await expect(card.getByText('Organizer · added today')).toBeVisible()
  await shot(page, 'tournaments/organizers-card-desktop.png')

  await card.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('dialog').getByText('Already organizer')).toBeVisible()
  await shot(page, 'tournaments/organizers-already-desktop.png')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  // Michael is told when the owner adds him
  await openHash(michael.page, '/tournaments/mine')
  // The push is not stored: /ws/me has to be up before the owner adds him
  await michael.page.waitForTimeout(3000)
  const id = new URL(page.url().replace('#', '')).pathname.split('/').at(-2)
  expect(ids.michael).toBeTruthy()
  await api(page).post(`/api/tournaments/${id}/organizers`, { userId: ids.michael })
  await expect(michael.page.getByText(/made you an organizer of/)).toBeVisible()
  await shot(michael.page, 'tournaments/organizers-toast-desktop.png')
})

test('tournaments: organizers phone', async ({ browser }) => {
  const admin = await open(browser, 'admin', VIEW.phone)
  const phil = await open(browser, 'phil', VIEW.phone)
  const michael = await open(browser, 'michael', VIEW.phone)
  await prepare(admin.page, [phil.page, michael.page])
  const page = admin.page
  await openHash(page, '/tournaments/new')
  await page.getByLabel('Name', { exact: true }).fill('Spring Club Night')
  await page.getByRole('button', { name: 'Add organizer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Select Michael' }).click()
  await shot(page, 'tournaments/organizers-add-dialog-phone.png')
})
