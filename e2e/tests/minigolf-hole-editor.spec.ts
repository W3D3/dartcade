import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'

const lane = {
  id: 'new',
  name: 'Editor lane',
  par: 2,
  outline: [
    [0, 0],
    [600, 0],
    [600, 2000],
    [0, 2000],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [300, 1750],
  cup: { at: [300, 300], r: 80 },
}

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

test('an admin draws on a hole, undoes, and test-putts it', async ({ adminPage: page }, testInfo) => {
  const hole = await page.request.post('/api/minigolf/holes', { data: { hole: lane } })
  expect(hole.ok()).toBeTruthy()
  const { id } = (await hole.json()) as { id: string }
  const course = await page.request.post('/api/minigolf/courses', {
    data: { name: 'Editor course', description: '', difficulty: 1, holeIds: [id] },
  })
  const { id: courseId } = (await course.json()) as { id: string }

  await page.goto(`/#/admin/minigolf/holes/${id}?course=${courseId}`)
  await expect(page.getByText('Hole 1 of 1')).toBeVisible()
  await expect(page.getByTestId('hole-3d')).toBeVisible()
  const elements = page.getByRole('region', { name: 'Elements' })

  // A wall, dragged across the lane
  await page.keyboard.press('w')
  const from = await onCanvas(page, 100, 1200)
  const to = await onCanvas(page, 400, 1200)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await expect(elements.getByText('Wall 1')).toBeVisible()

  // A bumper and a hill, clicked on
  await page.keyboard.press('b')
  const b = await onCanvas(page, 300, 900)
  await page.mouse.click(b.x, b.y)
  await expect(elements.getByText('Bumper 1')).toBeVisible()
  await page.keyboard.press('r')
  const hill = await onCanvas(page, 300, 1500)
  await page.mouse.click(hill.x, hill.y)
  await expect(elements.getByText('Hill')).toBeVisible()
  await page.getByLabel('Show height map').check()
  await page.screenshot({ path: testInfo.outputPath('hole-editor.png') })

  // Undo takes the hill away; the rest stays, and is saved
  await page.keyboard.press('Control+z')
  await expect(elements.getByText('Hill')).toHaveCount(0)
  await expect(elements.getByText('Bumper 1')).toBeVisible()
  await expect(page.getByText(/^Saved /)).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: testInfo.outputPath('hole-editor-undone.png') })

  await page.getByRole('button', { name: 'Test putt' }).click()
  const dialog = page.getByRole('dialog', { name: 'Test putt' })
  await expect(dialog.getByTestId('strokes')).toHaveText('Strokes 0')
  await expect(dialog.getByTestId('hole-3d')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('test-putt.png') })
  await dialog.getByRole('button', { name: 'Close' }).click()

  // The draft survives a reload
  await page.reload()
  await expect(elements.getByText('Wall 1')).toBeVisible()
  await expect(elements.getByText('Bumper 1')).toBeVisible()
})
