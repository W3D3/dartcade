import { test, expect } from '@playwright/test'
import { VIEW, open, shot, openHash } from './helpers.js'

// The Progress page's challenges with a mocked answer, so the "Hit 10 different doubles" row shows the
// doubles hit so far (nine of them, the longest list a row can show: a tenth completes it). CHALLENGES_SHOT=before|after names the files (before = the row without chips).
const which = process.env.CHALLENGES_SHOT ?? 'after'

const row = (
  id: string,
  slot: number,
  title: string,
  difficulty: string,
  target: number,
  progress: number,
  xp: number,
  chips: string[] = [],
) => ({
  id,
  slot,
  title,
  chips,
  difficulty,
  target,
  progress,
  xp,
  completed: false,
  claimed: false,
  canReroll: false,
})
const mocked = {
  daily: {
    resetsAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
    items: [
      row('d1', 1, 'Throw 100 darts on a board', 'easy', 100, 64, 40),
      row('d2', 2, 'Hit the bullseye', 'medium', 1, 0, 75),
      row('d3', 3, 'Hit 10 different doubles', 'hard', 10, 9, 125, ['D20', 'D19', 'D18', 'D17', 'D16', 'D15', 'D14', 'D13', 'Bull']),
    ],
  },
  weekly: {
    resetsAt: new Date(Date.now() + 4 * 86400_000).toISOString(),
    items: [
      row('w1', 1, 'Play 15 games', 'easy', 15, 6, 250),
      row('w2', 2, 'Score 60 or more 15 times', 'medium', 15, 9, 400),
      row('w3', 3, 'Win 2 legs in a row', 'hard', 2, 1, 600),
    ],
  },
}

for (const [name, view] of [
  ['desktop', VIEW.wide],
  ['phone', VIEW.phone],
  ['phone-320', { width: 320, height: 640, scale: 2 }],
] as const) {
  test(`challenges: ${which} ${name}`, async ({ browser }) => {
    const s = await open(browser, 'admin', view)
    await s.page.route('**/api/challenges', r => r.fulfill({ json: mocked }))
    await openHash(s.page, '/progress')
    await expect(s.page.getByRole('region', { name: 'Daily challenges' })).toBeVisible()
    await expect(s.page.getByText('Hit 10 different doubles')).toBeVisible()
    // The phone scrolls inside the page: bring the doubles row into view instead of a full-page shot
    await s.page.getByText('Hit 10 different doubles').scrollIntoViewIfNeeded()
    await shot(s.page, `challenges/${which}-${name}.png`, { fullPage: name === 'desktop', settle: 1500 })
    await s.ctx.close()
  })
}
