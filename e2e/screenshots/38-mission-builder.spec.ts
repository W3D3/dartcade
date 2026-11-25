import { test, expect, type Locator, type Page } from '@playwright/test'
import { VIEW, docPath, endActiveGames, leaveLobby, open, type View } from './helpers.js'

// Missions part 3: the builder (Mission-Builder, Tablet-Mission-Builder, Mission-Builder-Phone
// artboards); docs/missions/builder-*.png. Each size builds the artboard's Tungsten Gauntlet by hand
// and checks what Save mission sends; the test run is played for real.

const GAUNTLET = {
  name: 'Tungsten Gauntlet',
  description: 'Big fish, a perfect 20s streak and a tricky finish route. Good luck.',
  difficulty: 'hard',
  order: 'any',
  timeLimit: 900,
  onFail: 'retry',
  pause: true,
  rankBy: 'time',
  steps: [
    { type: 'checkout', start: 170, maxDarts: 8, finish: 'double' },
    { type: 'hit', targets: ['S20'], hits: 9, inARow: true, order: 'any' },
    { type: 'hit', targets: ['D11', 'B', 'D6'], hits: 1, inARow: false, order: 'in_order', within: 9 },
  ],
}

const radio = (scope: Page | Locator, group: string, option: string) =>
  scope.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option, exact: true })

/** A new builder, without a draft left by an earlier scene. */
async function newBuilder(page: Page): Promise<void> {
  await page.goto('/#/play/missions')
  await page.evaluate(() => localStorage.removeItem('mission-draft:new'))
  await page.goto('/#/play/missions/new')
  await expect(page.getByRole('main').getByRole('heading', { name: 'New mission' })).toBeVisible()
}

async function addStep(page: Page, type: RegExp, n: number): Promise<Locator> {
  const add = page.getByRole('button', { name: 'Add a step' })
  if (await add.isVisible()) await add.click()
  await page.getByRole('button', { name: type }).click()
  return page.getByRole('group', { name: `New step ${n}` })
}

async function pickTarget(page: Page, step: Locator, n: string): Promise<void> {
  await step.getByRole('button', { name: 'Add target' }).click()
  await page.getByRole('button', { name: n, exact: true }).click()
}

async function buildGauntlet(page: Page): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(GAUNTLET.name)
  await page.getByRole('textbox', { name: /Description/ }).fill(GAUNTLET.description)
  await radio(page, 'Difficulty', 'Hard').click()
  await radio(page, 'Time limit', '15m').click()

  const one = await addStep(page, /^Checkout/, 1)
  await one.getByLabel('Start score').fill('170')
  await one.getByLabel('Max darts').fill('8')
  await one.getByRole('button', { name: 'Add step' }).click()

  const two = await addStep(page, /^Hit targets/, 2)
  await two.getByRole('button', { name: 'Remove D20' }).click()
  await two.getByRole('button', { name: 'Remove T20' }).click()
  await two.getByLabel('Hits needed').fill('9')
  await radio(two, 'Counts', 'In a row').click()
  await radio(two, 'Window', 'No limit').click()
  await two.getByRole('button', { name: 'Add step' }).click()

  const three = await addStep(page, /^Hit targets/, 3)
  for (const t of ['S20', 'D20', 'T20']) await three.getByRole('button', { name: `Remove ${t}` }).click()
  await pickTarget(page, three, '11')
  await three.getByRole('button', { name: 'S11: change ring' }).click()
  await pickTarget(page, three, 'Bull')
  await pickTarget(page, three, '6')
  await three.getByRole('button', { name: 'S6: change ring' }).click()
  await radio(three, 'Order', 'In this order').click()
  await radio(three, 'Window', 'Within').click()
  await three.getByLabel('Darts').fill('9')
  await three.getByRole('button', { name: 'Add step' }).click()

  await radio(page, 'Pause', 'Allowed').click()
  await radio(page, 'Who can play it', 'Friends').click()
  // The artboard has the first step open
  await page.getByRole('button', { name: /^Check out 170/ }).click()
}

async function part(locator: Locator, file: string): Promise<void> {
  await locator.page().evaluate(() => document.fonts.ready)
  await locator.page().waitForTimeout(400)
  await locator.screenshot({ path: docPath(file), animations: 'disabled', caret: 'hide' })
}

const SIZES: [string, View][] = [
  ['desktop', { ...VIEW.wide, height: 1760 }],
  ['tablet', { ...VIEW.tablet, height: 2200 }],
  ['phone', { ...VIEW.phone, height: 3000 }],
]

for (const [size, view] of SIZES) {
  test(`builds the Tungsten Gauntlet, ${size}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    await newBuilder(page)
    await buildGauntlet(page)
    await expect(page.getByText('We suggest Hard from your steps.')).toBeVisible()
    if (size !== 'phone') {
      const preview = page.getByRole('region', { name: 'Preview' })
      await expect(preview.getByText('Finish all 3 steps in any order within 15:00.')).toBeVisible()
      await expect(preview.getByText(/Usually takes 7–13 min · about 65 darts/)).toBeVisible()
    }
    await page.screenshot({ path: docPath(`missions/builder-${size}.png`), animations: 'disabled', caret: 'hide' })
    if (size === 'desktop') await part(page.getByRole('region', { name: 'Preview' }), 'missions/builder-preview-desktop.png')

    // The keyboard moves a step: step 3 up and back
    const handle = page.getByRole('button', { name: 'Move step 3: drag, or use the arrow keys' })
    await handle.focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: /^D11 → Bull → D6/ })).toBeVisible()
    await expect(page.locator('[data-sortable-id]').nth(1)).toContainText('D11 → Bull → D6')
    await page.getByRole('button', { name: 'Move step 2: drag, or use the arrow keys' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-sortable-id]').nth(2)).toContainText('D11 → Bull → D6')

    // Save sends the artboard's mission (answered here, so nothing is stored)
    let sent: unknown = null
    await page.route('**/api/missions', async r => {
      if (r.request().method() !== 'POST') return r.fallback()
      sent = r.request().postDataJSON()
      await r.fulfill({ status: 400, json: { error: 'invalid request', details: [] } })
    })
    await page.getByRole('button', { name: 'Save mission' }).click()
    await expect.poll(() => sent).toEqual({ mission: GAUNTLET, visibility: 'friends' })
    await ctx.close()
  })
}

test('the add-step sheet, each step type, and the checks', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', { ...VIEW.wide, height: 1400 })
  await newBuilder(page)
  const steps = page.locator('section', { has: page.getByRole('heading', { name: 'Steps' }) })
  await part(steps, 'missions/builder-add-step-desktop.png')

  for (const [type, file] of [
    [/^Checkout/, 'checkout'],
    [/^Hit targets/, 'hit'],
    [/^Marks/, 'marks'],
    [/^Visits/, 'visits'],
    [/^Score/, 'score'],
    [/^Average/, 'average'],
    [/^Fast leg/, 'leg'],
  ] as const) {
    const step = await addStep(page, type, 1)
    await part(step, `missions/builder-step-${file}-desktop.png`)
    await step.getByRole('button', { name: 'Change type' }).click()
  }

  // A preset fills the step in
  const marks = await addStep(page, /^Marks/, 1)
  await marks.getByRole('button', { name: 'Close 15–20 + Bull' }).click()
  await marks.getByRole('button', { name: 'Add step' }).click()
  await expect(page.getByRole('button', { name: /^Close 15–20 \+ Bull Marks/ })).toBeVisible()

  // The checks: a checkout the darts can't make, and Save with no name
  const co = await addStep(page, /^Checkout/, 2)
  await co.getByLabel('Start score').fill('170')
  await co.getByLabel('Max darts').fill('2')
  await co.getByRole('button', { name: 'Add step' }).click()
  await expect(co.getByText('Cannot be checked out in that many darts')).toBeVisible()
  await co.getByLabel('Max darts').fill('3')
  await co.getByRole('button', { name: 'Add step' }).click()
  // The new step's card is open: empty its darts
  await page.getByLabel('Max darts').fill('')
  await page.getByRole('button', { name: 'Save mission' }).click()
  await expect(page.getByText('Must not be blank')).toBeVisible()
  await expect(page.getByText('Enter a number')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused()
  await page.screenshot({ path: docPath('missions/builder-errors-desktop.png'), animations: 'disabled', caret: 'hide' })
  await ctx.close()
})

test('Test it first plays a test run, then goes back to the builder', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin', { ...VIEW.wide, height: 1100 })
  await endActiveGames(page)
  await leaveLobby(page)
  await newBuilder(page)
  await buildGauntlet(page)
  await page.getByRole('button', { name: 'Test it first' }).click()
  await expect(page.getByText('Test run · counts for no times or stats')).toBeVisible()
  await page.screenshot({ path: docPath('missions/builder-test-run-desktop.png'), animations: 'disabled', caret: 'hide' })
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('button', { name: 'Back to the builder' }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: 'Edit mission' })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Tungsten Gauntlet')
  // Clean up: the owner deletes it
  await page.getByRole('button', { name: 'Delete mission' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/#\/play\/missions\/mine/)
  await ctx.close()
})
