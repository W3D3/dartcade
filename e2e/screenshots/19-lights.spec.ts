import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, open, shot } from './helpers.js'

const VIEWS = [
  [{ width: 1440, height: 1750, scale: 2 }, 'desktop'],
  [{ width: 390, height: 2400, scale: 2 }, 'phone'],
] as const

test('lights profile: the seat colours group on top, a seat colour picker, a saved colour', async ({ browser }) => {
  for (const [view, name] of VIEWS) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/lights')
    await expect(page.getByRole('region', { name: 'Light profile' })).toBeVisible()
    await shot(page, `lights/profile-${name}.png`)

    await page.getByRole('button', { name: /^Seat 3 colour: orange/ }).click()
    await expect(page.getByRole('radiogroup', { name: 'Seat 3 colour' })).toBeVisible()
    await shot(page, `lights/picker-${name}.png`)

    await page.getByRole('radio', { name: 'blue' }).click()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: blue/ })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: blue/ })).toBeVisible()
    await shot(page, `lights/edited-${name}.png`)

    await page.getByRole('button', { name: 'Reset to defaults' }).click()
    await expect(page.getByRole('button', { name: /^Seat 3 colour: orange/ })).toBeVisible()
    await ctx.close()
  }
})

// A friend's file: 14 of the built-in effects, one for an effect that does not exist and one for a game that does not
const friendsFile = (builtIn: { effects: object[] }) =>
  JSON.stringify({
    ...builtIn,
    name: 'Phil’s lights',
    effects: [
      ...builtIn.effects.slice(0, 14),
      { trigger: 'atc.hit', seats: 'mine', type: 'flash', enabled: true, look: { preset: '180' } },
      { trigger: 'bust', game: 'darts-of-doom', seats: 'mine', type: 'flash', enabled: true, look: { preset: 'Busted' } },
    ],
  })

/** Deletes the player's own profiles (a run that failed half-way leaves them), so the board is on the built-in one. */
async function removeOwnProfiles(page: Page, boardId: string) {
  const { profiles } = (await (await page.request.get(`/api/boards/${boardId}/lights`)).json()) as {
    profiles: { id: string; builtIn: boolean }[]
  }
  for (const p of profiles.filter(p => !p.builtIn)) {
    const res = await page.request.delete(`/api/boards/${boardId}/lights/profiles/${p.id}`, { headers: { Origin: BASE } })
    expect(res.ok()).toBe(true)
  }
}

test('light profiles: the profile menu, a duplicate, an import with its result, an export', async ({ browser }) => {
  for (const [view, name] of [
    [{ width: 1440, height: 1750, scale: 2 }, 'desktop'],
    [{ width: 390, height: 2400, scale: 2 }, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/lights')
    await expect(page.getByRole('region', { name: 'Light profile' })).toBeVisible()

    const builtIn = (await (await page.request.get('/api/boards')).json()) as { boards: { id: string }[] }
    const boardId = builtIn.boards[0].id
    await removeOwnProfiles(page, boardId)
    const exported = await (await page.request.get(`/api/boards/${boardId}/lights/profile/export`)).json()

    // Duplicate: the copy is in use, named "Copy of …"
    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(page.getByRole('button', { name: 'Light profile', exact: true })).toContainText('Copy of Dartcade default')
    await page.getByRole('button', { name: 'Light profile', exact: true }).click()
    await expect(page.getByRole('option', { name: /Copy of Dartcade default/ })).toBeVisible()
    await shot(page, `lights/profile-menu-${name}.png`)
    await page.keyboard.press('Escape')
    await shot(page, `lights/duplicate-${name}.png`)

    // Import: a new profile, never an overwrite, with what came through and what was ignored
    await page.locator('input[type=file]').setInputFiles({
      name: 'phils-lights.dartcade-lights.json',
      mimeType: 'application/json',
      buffer: Buffer.from(friendsFile(exported)),
    })
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('status')).toHaveText('Imported 14 effects, ignored 2')
    await shot(page, `lights/import-result-${name}.png`)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('button', { name: 'Light profile', exact: true })).toContainText('Phil’s lights')

    // Export: the file has the name, seat colours and effects, and nothing private
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    const file = JSON.parse(await (await (await download).createReadStream()).toArray().then(c => Buffer.concat(c).toString()))
    expect(file).toMatchObject({ format: 'dartcade-light-profile', version: 1, name: 'Phil’s lights' })
    expect(JSON.stringify(file)).not.toMatch(/"(id|host|mac|token|state)"/)

    // The Delete button asks first; the rest are removed through the API so the next run starts from the built-in profile
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await removeOwnProfiles(page, boardId)
    await ctx.close()
  }
})

test('light effects: switching single effects off and on, kept after a reload', async ({ browser }) => {
  for (const [view, name] of [
    [{ width: 1440, height: 1750, scale: 2 }, 'desktop'],
    [{ width: 390, height: 2400, scale: 2 }, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'admin', view)
    await page.goto('/#/settings/lights')
    await expect(page.getByRole('region', { name: 'Light profile' })).toBeVisible()
    const bigScore = page.getByRole('switch', { name: 'Visit scored ≥ 100 on' })
    const lobby = page.getByRole('switch', { name: 'Lobby on' })
    const turnOther = page.getByRole('switch', { name: 'Turn changes other board on' })
    await expect(bigScore).toBeChecked()
    await expect(lobby).not.toBeChecked() // ships off

    await bigScore.click()
    await turnOther.click()
    await lobby.click()
    await expect(bigScore).not.toBeChecked()
    await expect(lobby).toBeChecked()
    await page.reload()
    await expect(page.getByRole('switch', { name: 'Visit scored ≥ 100 on' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: 'Lobby on' })).toBeChecked()
    await shot(page, `lights/switches-${name}.png`)

    // Back to how it ships, so the next run and the other screenshots start clean
    await page.getByRole('switch', { name: 'Visit scored ≥ 100 on' }).click()
    await page.getByRole('switch', { name: 'Turn changes other board on' }).click()
    await page.getByRole('switch', { name: 'Lobby on' }).click()
    await expect(page.getByRole('switch', { name: 'Lobby on' })).not.toBeChecked()
    await expect(page.getByRole('switch', { name: 'Visit scored ≥ 100 on' })).toBeChecked()
    await ctx.close()
  }
})
