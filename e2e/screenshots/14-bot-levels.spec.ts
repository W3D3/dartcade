import { test, expect } from '@playwright/test'
import { VIEW, open, shot, hostLobby, addBot, X01, leaveLobby } from './helpers.js'

// The bot level picker (20 levels) and bots' avatar colours across the range (#487)
const views = [
  [VIEW.desktop, 'desktop'],
  [VIEW.phone, 'phone-390'],
  [VIEW.narrowPhone, 'phone-320'],
] as const

for (const [view, name] of views) {
  test(`bot level picker: ${name}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const michael = await open(browser, 'michael', view)
    const lobby = await hostLobby(michael.page, "Michael's lobby", X01())
    for (const level of [1, 5, 10, 15, 20]) await addBot(michael.page, lobby, level)
    await michael.page.goto('/#/lobby')
    const add = michael.page.getByRole('button', { name: 'Add bot' })
    await expect(add).toBeVisible()
    await shot(michael.page, `bots/levels-lobby-${name}.png`)
    for (const level of [1, 10, 20]) {
      await add.click()
      const slider = michael.page.getByRole('slider')
      await expect(slider).toBeVisible()
      await slider.focus()
      // The slider keeps its value between openings: go to the start, then step up
      await michael.page.keyboard.press('Home')
      for (let i = 1; i < level; i++) await michael.page.keyboard.press('ArrowRight')
      await expect(michael.page.getByText(`Level ${level}`, { exact: true }).first()).toBeVisible()
      await shot(michael.page, `bots/levels-picker-${level}-${name}.png`)
      await michael.page.keyboard.press('Escape')
      await expect(slider).toBeHidden()
    }
    await leaveLobby(michael.page)
    await michael.ctx.close()
  })
}
