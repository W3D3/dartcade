import { test, expect } from '@playwright/test'
import { VIEW, open, openHash, shot } from './helpers.js'

// Tournament-Create's Basics: where it is played (online or in person), who can join (Chosen by
// organizer only in person) and, for a list the organizers add, who can see it.

test('tournaments: play and visibility, online', async ({ browser }) => {
  const s = await open(browser, 'admin', VIEW.wide)
  await openHash(s.page, '/tournaments/new')
  await s.page.getByLabel('Name', { exact: true }).fill('Friday Open')
  await expect(s.page.getByRole('radiogroup', { name: 'Who can join' }).getByRole('radio', { name: 'Chosen by organizer' })).toBeDisabled()
  await shot(s.page, 'tournaments/play-online-desktop.png')
})

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const)
  test(`tournaments: play and visibility, in person and private, ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await openHash(s.page, '/tournaments/new')
    await s.page.getByLabel('Name', { exact: true }).fill('Club Night')
    await s.page.getByRole('radiogroup', { name: 'Where is it played?' }).getByRole('radio', { name: 'In person' }).click()
    await s.page.getByRole('radiogroup', { name: 'Who can join' }).getByRole('radio', { name: 'Chosen by organizer' }).click()
    await s.page.getByRole('radiogroup', { name: 'Who can see it' }).getByRole('radio', { name: 'Private' }).click()
    await expect(s.page.getByText('Only the organizers and the players who claimed their spot see it.')).toBeVisible()
    await shot(s.page, `tournaments/play-in-person-private-${name}.png`)
  })
