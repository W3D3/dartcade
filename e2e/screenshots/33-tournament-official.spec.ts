import { test, expect, type Page } from '@playwright/test'
import { VIEW, api, open, openHash, shot } from './helpers.js'

// Browse's featured official tournament (Tournaments, the Weekly Open hero) with its prizes, and
// its Details. An admin makes it through the API; the planning page is a later ticket.

async function weekly(page: Page): Promise<string> {
  const startsAt = new Date(Date.now() + 5 * 864e5)
  startsAt.setHours(19, 0, 0, 0)
  const t = (await api(page).post('/api/tournaments/official', {
    tournament: {
      name: 'Dartcade Weekly Open #46',
      description: 'The weekly open: single elimination, first to 3, 501 double out.',
      play: 'online',
      preselected: false,
      visibility: 'public',
      gameId: 'x01',
      gameConfig: { startScore: 501, outMode: 'double' },
      format: 'single_elimination',
      teamSize: 1,
      maxEntries: 64,
      startsAt: startsAt.toISOString(),
      settings: {
        seeding: 'rating',
        firstTo: 3,
        longerFinal: null,
        groups: null,
        registrationClosesMinutes: 60,
        checkInMinutes: 30,
        plannedFor: null,
        manualScoring: true,
        noShowMinutes: 10,
        avgLimit: null,
      },
    },
    tags: ['weekly'],
    prizes: [
      { from: 1, to: 1, xp: 2000, title: 'title.weekly-champion' },
      { from: 2, to: 2, xp: 1000, title: null },
      { from: 3, to: 4, xp: 500, title: null },
    ],
  })) as { id: string }
  await api(page).post(`/api/tournaments/${t.id}/publish`)
  return t.id
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
] as const)
  test(`tournaments: official hero and prizes, ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    const id = await weekly(s.page)
    try {
      await openHash(s.page, '/tournaments/browse')
      await expect(s.page.getByRole('region', { name: 'Featured tournament' }).getByText('WEEKLY', { exact: true })).toBeVisible()
      await shot(s.page, `tournaments/official-hero-${name}.png`)
      await s.page.getByRole('button', { name: 'Details' }).first().click()
      await expect(s.page.getByLabel('Prizes').last()).toBeVisible()
      await shot(s.page, `tournaments/official-details-${name}.png`)
    } finally {
      await api(s.page).post(`/api/tournaments/${id}/cancel`)
    }
  })
