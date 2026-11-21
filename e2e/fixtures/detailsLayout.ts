import { expect, type Page } from '@playwright/test'

// Shared by the CI smoke spec (tests/match-details-layout.spec.ts) and the docs sweep (screenshots/35-details-layout.spec.ts)
export const LONG = 'Bartholomew-Maximilian Featherstonehaugh'

const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

export async function checkLayout(page: Page, long: boolean) {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    const main = document.querySelector('main')!
    if (main.scrollWidth > main.clientWidth + 1) out.push(`page scrolls sideways: ${main.scrollWidth} > ${main.clientWidth}`)
    return out
  })
  expect(bad).toEqual([])
  // Hero names are cut only when the name itself is too long for any column
  if (!long) {
    const cut = await page
      .locator('section[aria-label="Result"] .truncate')
      .evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent))
    expect(cut, 'hero names cut').toEqual([])
  }
  // Cricket: one header per player, none over another, all inside the card
  const heads = await page
    .locator('section[aria-label="Leg by leg"] thead th')
    .evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()))
  if (heads.length) {
    const card = await page.locator('section[aria-label="Leg by leg"]').evaluate(e => e.getBoundingClientRect().toJSON())
    for (const [i, h] of heads.entries()) {
      expect(h.right, `header ${i} inside the card`).toBeLessThanOrEqual(card.right + 1)
      if (i) expect(overlap(heads[i - 1] as DOMRect, h as DOMRect), `headers ${i - 1}/${i} overlap`).toBe(false)
    }
    const names = await page
      .locator('section[aria-label="Leg by leg"] thead th > span')
      .evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()))
    for (const [i, n] of names.entries())
      if (i) expect(overlap(names[i - 1] as DOMRect, n as DOMRect), `names ${i - 1}/${i} overlap`).toBe(false)
  }
  // X01 chalkboard: the cells of a visit row never overlap, and a cell's children stay inside it
  const rows = await page.locator('[role=table] [role=row]').evaluateAll(rows =>
    rows.map(r =>
      [...r.querySelectorAll(':scope > [role=cell]')].map(c => ({
        cell: c.getBoundingClientRect().toJSON(),
        kids: [...c.querySelectorAll('span')].map(k => k.getBoundingClientRect().toJSON()),
      })),
    ),
  )
  for (const cells of rows)
    for (const [i, c] of cells.entries()) {
      if (i) expect(overlap(cells[i - 1].cell as DOMRect, c.cell as DOMRect), 'chalkboard cells overlap').toBe(false)
      if (c.cell.width) for (const k of c.kids) expect(k.right, 'chalkboard chip outside its cell').toBeLessThanOrEqual(c.cell.right + 1)
    }
}


/** Every player's name on this game's details answer made very long, for the narrow-column cases. */
export async function useLongNames(page: Page, gameId: string): Promise<void> {
  const game = (await (await page.request.get(`/api/games/${gameId}`)).json()) as { game: { players: { name: string }[] } }
  const names = game.game.players.map(p => p.name)
  await page.route(`**/api/games/${gameId}`, async route => {
    const body = await (await route.fetch()).text()
    await route.fulfill({ contentType: 'application/json', body: names.reduce((t, n) => t.replaceAll(`"${n}"`, `"${n} ${LONG}"`), body) })
  })
}
