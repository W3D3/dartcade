import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'
import type { Page } from '@playwright/test'

// Tablets, touch: select a dart, tap the board to move it (the board is 2.3 units across, r = 1 at the double wire)
for (const viewport of [
  { width: 1180, height: 820 },
  { width: 768, height: 1024 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true })

    // Where a board point is on screen now: selecting a dart opens the correction popover, which can resize the board
    async function tapBoard(page: Page, x: number, y: number) {
      const box = await page.getByRole('application', { name: 'Dartboard' }).boundingBox()
      if (!box) throw new Error('no board')
      const unit = box.width / 2.3
      await page.touchscreen.tap(box.x + box.width / 2 + x * unit, box.y + box.height / 2 - y * unit)
    }
    const thrown = (page: Page) => page.getByRole('button', { name: /Correct this dart/ })

    test.beforeEach(async ({ authedPage: page }) => {
      await startGame(page, { mode: 'X01' })
      await page.getByRole('button', { name: 'Board', exact: true }).click()
    })

    test('select a dart in its slot, tap the board: it moves and no dart is thrown', async ({ authedPage: page }) => {
      await tapBoard(page, 0, 0.8) // single 20
      await expect(thrown(page)).toHaveCount(1)
      await expect(thrown(page).first()).toContainText('20')

      await thrown(page).first().click()
      await expect(page.locator('[data-dart-selected]')).toHaveCount(1)
      await expect(page.getByText('Tap the board to move this dart')).toBeVisible()

      await tapBoard(page, 0.8, 0) // single 6
      await expect(thrown(page)).toHaveCount(1)
      await expect(thrown(page).first()).toContainText('6')
      await expect(page.locator('[data-dart-selected]')).toHaveCount(0)
    })

    // With nothing selected a board tap places a dart, as it always did: grouped darts, even on one spot
    const groups = [
      {
        name: 'T20 T20 T20',
        taps: [
          [-0.06, 0.605],
          [0, 0.605],
          [0.06, 0.605],
        ],
        label: 'T20',
      },
      {
        name: 'T19 T19 T19',
        taps: [
          [-0.187 + 0.057, -0.575 - 0.019],
          [-0.187, -0.575],
          [-0.187 - 0.057, -0.575 + 0.019],
        ],
        label: 'T19',
      },
      {
        name: 'bull bull bull',
        taps: [
          [0, 0],
          [0.005, 0],
          [-0.005, 0],
        ],
        label: 'Bull',
      },
    ]
    for (const g of groups) {
      test(`${g.name} by tapping places three darts`, async ({ authedPage: page }) => {
        for (const [x, y] of g.taps) await tapBoard(page, x, y)
        await expect(thrown(page)).toHaveCount(3)
        await expect(thrown(page).first()).toContainText(g.label)
        await expect(page.locator('[data-dart-selected]')).toHaveCount(0)
      })
    }

    test('tapping the slot again, the marker, Escape and outside the board deselect', async ({ authedPage: page }) => {
      await tapBoard(page, 0, 0.8)
      const selected = page.locator('[data-dart-selected]')

      await thrown(page).first().click()
      await expect(selected).toHaveCount(1)
      await thrown(page).first().click()
      await expect(selected).toHaveCount(0)

      // The selected dart's own marker deselects it too
      await thrown(page).first().click()
      await expect(selected).toHaveCount(1)
      await tapBoard(page, 0, 0.8)
      await expect(selected).toHaveCount(0)
      await expect(thrown(page)).toHaveCount(1)

      await thrown(page).first().click()
      await page.keyboard.press('Escape')
      await expect(selected).toHaveCount(0)

      await thrown(page).first().click()
      await tapBoard(page, 0.95, 0.95)
      await expect(selected).toHaveCount(0)
      await expect(thrown(page)).toHaveCount(1)
      await expect(thrown(page).first()).toContainText('20')
    })

    test('dragging a dart still moves it', async ({ authedPage: page }) => {
      await tapBoard(page, 0, 0.8)
      const box = (await page.getByRole('application', { name: 'Dartboard' }).boundingBox())!
      const at = (x: number, y: number) => ({
        x: box.x + box.width / 2 + (x * box.width) / 2.3,
        y: box.y + box.height / 2 - (y * box.width) / 2.3,
      })
      await page.mouse.move(at(0, 0.8).x, at(0, 0.8).y)
      await page.mouse.down()
      await page.mouse.move(at(0.4, 0.4).x, at(0.4, 0.4).y, { steps: 5 })
      await page.mouse.move(at(0.8, 0).x, at(0.8, 0).y, { steps: 5 })
      await page.mouse.up()
      await expect(thrown(page)).toHaveCount(1)
      await expect(thrown(page).first()).toContainText('6')
    })
  })
}
