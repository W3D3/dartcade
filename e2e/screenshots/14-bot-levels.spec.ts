import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, addBot, X01, leaveLobby } from './helpers.js'

// The bot level picker (20 levels) and bots' avatar colours across the range (#487)
for (const [view, name] of [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone'],
] as const) {
  test(`bot level picker: ${name}`, async ({ browser }) => {
    const michael = await open(browser, 'michael', view)
    const lobby = await hostLobby(michael.page, "Michael's lobby", X01())
    for (const level of [1, 7, 13, 20]) await addBot(michael.page, lobby, level)
    await michael.page.goto('/#/lobby')
    await expect(michael.page.getByRole('button', { name: 'Add bot' })).toBeVisible()
    await shot(michael.page, `bots/levels-lobby-${name}.png`)
    await michael.page.getByRole('button', { name: 'Add bot' }).click()
    await expect(michael.page.getByRole('slider')).toBeVisible()
    await michael.page.getByRole('slider').focus()
    for (let i = 0; i < 12; i++) await michael.page.keyboard.press('ArrowRight')
    await shot(michael.page, `bots/levels-picker-${name}.png`)
    await michael.page.keyboard.press('Escape')
    await leaveLobby(michael.page)
    await michael.ctx.close()
  })
}
