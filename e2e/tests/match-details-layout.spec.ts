import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/auth.js'
import { checkLayout, useLongNames } from '../fixtures/detailsLayout.js'
import { startGame } from '../fixtures/lobby.js'

// Match details at the sizes where #697 and #698 broke: cricket's Final marks headers, the score hero's
// names and the X01 visit cells. The wider sweep is e2e/screenshots/35-details-layout.spec.ts.
const IPAD_LANDSCAPE = { width: 1024, height: 768 }
const DESKTOP = { width: 1920, height: 1080 }

async function newestGameId(page: Page, mode: string): Promise<string> {
  const res = await page.request.get(`/api/games?mode=${mode}&limit=1`)
  return ((await res.json()) as { games: { id: string }[] }).games[0].id
}

async function openDetails(page: Page, id: string, size: { width: number; height: number }, ready: string): Promise<void> {
  await page.setViewportSize(size)
  await page.goto(`/#/history/${id}`)
  await expect(page.getByRole('region', { name: ready, exact: true })).toBeVisible({ timeout: 30_000 })
}

test('cricket details: three players, Final marks headers stay over their columns', async ({ adminPage: page }) => {
  test.setTimeout(120_000)
  await startGame(page, { mode: 'Cricket', guests: ['Guest One', 'Guest Two'] })
  const treble = async (n: number) => {
    await page.getByRole('button', { name: 'Treble', exact: true }).click()
    await page.click(`button[aria-label="Treble ${n}"]`)
  }
  const next = () => page.getByRole('button', { name: 'Next player' }).click()
  const guestsMiss = async () => {
    for (let guest = 0; guest < 2; guest++) {
      for (let dart = 0; dart < 3; dart++) await page.click('button[aria-label="Miss"]')
      await next()
    }
  }
  for (const targets of [
    [20, 19, 18],
    [17, 16, 15],
  ]) {
    for (const n of targets) await treble(n)
    await next()
    await guestsMiss()
  }
  await page.click('button[aria-label="Bull, 50"]')
  await page.click('button[aria-label="Outer bull, 25"]')
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()

  const id = await newestGameId(page, 'cricket')
  await openDetails(page, id, IPAD_LANDSCAPE, 'Leg by leg')
  await checkLayout(page, false)

  await useLongNames(page, id)
  await openDetails(page, id, IPAD_LANDSCAPE, 'Leg by leg')
  await checkLayout(page, true)
})

test('X01 details: two players, names in the score hero and visit cells apart', async ({ adminPage: page }) => {
  test.setTimeout(120_000)
  await startGame(page, {
    mode: 'X01',
    guests: ['Guest One'],
    setup: async page => {
      const main = page.locator('main')
      await main.getByRole('radio', { name: '301', exact: true }).click()
      const fewer = main.getByRole('button', { name: 'Fewer legs' })
      const legs = fewer.locator('xpath=following-sibling::span[1]')
      const isOne = async () => /^1\s*leg$/.test(((await legs.textContent()) ?? '').trim())
      for (let i = 0; i < 10 && !(await isOne()); i++) await fewer.click()
    },
  })
  const throwDart = async (multiplier: 'Treble' | 'Double', label: string) => {
    await page.getByRole('button', { name: multiplier, exact: true }).click()
    await page.click(`button[aria-label="${label}"]`)
  }
  const next = () => page.getByRole('button', { name: 'Next player' }).click()
  for (let i = 0; i < 3; i++) await throwDart('Treble', 'Treble 20')
  await next()
  for (let i = 0; i < 3; i++) await page.click('button[aria-label="Miss"]')
  await next()
  await throwDart('Treble', 'Treble 17')
  await throwDart('Treble', 'Treble 18')
  await throwDart('Double', 'Double 8')
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()

  const id = await newestGameId(page, 'x01')
  for (const size of [IPAD_LANDSCAPE, DESKTOP]) {
    await openDetails(page, id, size, 'Result')
    await expect(page.getByRole('table', { name: /Visits in this leg/ })).toBeVisible()
    await checkLayout(page, false)
  }

  await useLongNames(page, id)
  await openDetails(page, id, IPAD_LANDSCAPE, 'Result')
  await checkLayout(page, true)
})
