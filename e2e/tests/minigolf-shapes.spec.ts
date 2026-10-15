import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'
import { endAnyRunningGame, startGame } from '../fixtures/lobby.js'

/** A course point (mm) on the editor canvas, in page pixels. */
async function onCanvas(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.locator('[aria-label="Hole canvas"] svg').evaluate(
    (svg, [x, y]) => {
      const p = new DOMPoint(x, y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!)
      return { x: p.x, y: p.y }
    },
    [x, y],
  )
}

// A fresh course, not the shared seeded "test" course: this spec publishes a change, and the
// other Minigolf specs must keep working no matter the run order.
test('an admin draws a keyhole, curves a rail, publishes and plays it', async ({ adminPage: page }) => {
  test.setTimeout(60_000)

  await endAnyRunningGame(page)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: /^Account/ })
    .click()
  await page.getByRole('menuitem', { name: 'Admin' }).click()
  await page.getByRole('menuitem', { name: 'Minigolf courses' }).click()
  await page.waitForURL('**/#/admin/minigolf/courses')
  await page.getByRole('button', { name: 'New course' }).click()
  await page.waitForURL(/\/admin\/minigolf\/courses\/[^/]+$/)
  // Unique: parallel workers and reruns all publish to the same course list
  const courseName = `E2E shapes ${Date.now().toString(36)}`
  await page.locator('label:has-text("Course name") input').fill(courseName)
  await page.getByRole('textbox', { name: 'Short description' }).fill('A keyhole')

  await page.getByRole('button', { name: 'New hole', exact: true }).click()
  await page.waitForURL(/\/admin\/minigolf\/holes\//)
  await expect(page.getByTestId('par')).toHaveText('2')
  const elements = page.getByRole('region', { name: 'Elements' })

  // A circle round the cup (at [300, 300]), wide enough to bulge past the lane's rails: a keyhole
  await page.keyboard.press('i')
  const centre = await onCanvas(page, 300, 300)
  const rim = await onCanvas(page, 700, 300)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(rim.x, rim.y, { steps: 5 })
  await page.mouse.up()
  await expect(elements.getByText('Circle 1')).toBeVisible()

  // A refused edit: the field goes back to where the circle is
  await elements.getByText('Circle 1').click()
  const x = page.getByLabel('X', { exact: true })
  const before = await x.inputValue()
  await x.fill('5000')
  await x.press('Enter')
  await expect(page.getByText('The circle must overlap the course')).toBeVisible()
  await expect(x).toHaveValue(before)
  await x.blur()

  // One long rail (the lane's right edge, corner 2 to corner 3), curved: off its midpoint (which
  // is the ● that adds a corner instead) and well clear of the circle
  await page.keyboard.press('o')
  const edge = await onCanvas(page, 600, 700)
  await page.mouse.click(edge.x, edge.y)
  await expect(page.getByText('From corner 2 to corner 3.')).toBeVisible()
  await page.getByRole('button', { name: 'Curve', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Straighten', exact: true })).toBeVisible()
  await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: 10_000 })

  // Back, publish
  await page.getByRole('link', { name: 'Done' }).click()
  await page.waitForURL(/\/admin\/minigolf\/courses\/[^/]+$/)
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByText('Published · no changes')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)

  // A full reload so the Play page's game modes (and the course list in them) are fetched fresh
  await page.reload()

  // Start a solo Minigolf game on the new course and see the hole card: the baked keyhole plays fine
  await startGame(page, {
    mode: 'Minigolf',
    setup: async p => {
      await p.getByRole('radio', { name: new RegExp(courseName) }).click()
    },
  })
  await expect(page.getByLabel('Hole', { exact: true })).toBeVisible()

  await endAnyRunningGame(page)
})

// The seeded "test" course's hole 1 predates shapes: it must keep opening as plain corners, with
// no shape overlay and no circles, until someone edits it with the Circle or Curve tool.
test('the seeded course’s hole 1 still shows plain corners', async ({ adminPage: page }) => {
  await endAnyRunningGame(page)
  await page.goto('/#/admin/minigolf/holes/test-straight?course=test')
  await expect(page.getByText('Hole 1 of 4')).toBeVisible()
  await expect(page.getByTestId('par')).toHaveText('2')

  await page.keyboard.press('o')
  await expect(page.getByTestId('shape-guides')).toHaveCount(0)
  const elements = page.getByRole('region', { name: 'Elements' })
  await expect(elements.getByText('4 corners')).toBeVisible()
  await expect(elements.getByText(/Circle/)).toHaveCount(0)

  await endAnyRunningGame(page)
})
