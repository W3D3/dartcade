// Every game's art is whole and centred in its tile: the strip rows on the Play page and the header tile of
// the settings panel. It measures the box the drawn art covers against the tile, so a new mode's art is
// checked without being listed here.
import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { E2E_ORIGIN } from '../fixtures/origin.js'

const ACCOUNT = { email: 'visual@test.local', password: 'VisualPass1!' }
const HEADERS = { Origin: E2E_ORIGIN }
const TOLERANCE_PX = 1
const EDGE_PX = 3
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } }

type Radii = { tl: number; tr: number; bl: number; br: number }

/** How far the art's box is from the tile's middle, in px, and whether the tile cuts it off; corners the tile's rounding cuts away are ignored. */
async function offCentre(page: Page, tile: Locator, radii: Radii) {
  const png = (await tile.screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(
    async ({ png, radii, EDGE_PX }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
      const { width: w, height: h } = bitmap
      const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const px = ctx.getImageData(0, 0, w, h).data
      // the tile's border and what its rounded corners cut away are not art
      const corner = (x: number, y: number, r: number, cx: number, cy: number) =>
        r > 0 && Math.abs(x + 0.5 - cx) <= r && Math.abs(y + 0.5 - cy) <= r && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r - EDGE_PX
      const clipped = (x: number, y: number) =>
        x < EDGE_PX ||
        y < EDGE_PX ||
        x >= w - EDGE_PX ||
        y >= h - EDGE_PX ||
        (x < radii.tl && y < radii.tl && corner(x, y, radii.tl, radii.tl, radii.tl)) ||
        (x < radii.bl && y >= h - radii.bl && corner(x, y, radii.bl, radii.bl, h - radii.bl)) ||
        (x >= w - radii.tr && y < radii.tr && corner(x, y, radii.tr, w - radii.tr, radii.tr)) ||
        (x >= w - radii.br && y >= h - radii.br && corner(x, y, radii.br, w - radii.br, h - radii.br))
      // the tile's own colour is the one most pixels have
      const counts = new Map<number, number>()
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (clipped(x, y)) continue
          const i = 4 * (y * w + x)
          const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const bg = [top >> 16, (top >> 8) & 255, top & 255]
      let [x0, y0, x1, y1] = [w, h, -1, -1]
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (clipped(x, y)) continue
          const i = 4 * (y * w + x)
          if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < 30) continue
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
          y0 = Math.min(y0, y)
          y1 = Math.max(y1, y)
        }
      }
      if (x1 < 0) return null
      // art that reaches the frame is cut off by its tile
      const cutOff = x0 <= EDGE_PX || y0 <= EDGE_PX || x1 + 1 >= w - EDGE_PX || y1 + 1 >= h - EDGE_PX
      return { dx: (x0 + x1 + 1) / 2 - w / 2, dy: (y0 + y1 + 1) / 2 - h / 2, cutOff }
    },
    { png, radii, EDGE_PX },
  )
}

const radiiOf = async (el: Locator, rightSquare = false): Promise<Radii> =>
  el.evaluate((node, rightSquare) => {
    const s = getComputedStyle(node)
    const [tl, tr, bl, br] = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].map(
      parseFloat,
    )
    return rightSquare ? { tl, tr: 0, bl, br: 0 } : { tl, tr, bl, br }
  }, rightSquare)

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`game art is centred in its tiles (${size})`, async ({ browser }) => {
    // A new context each time: the picked game is remembered, which turns the cards into rows
    const play = async () => {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      expect((await page.request.post('/api/auth/sign-in/email', { data: ACCOUNT, headers: HEADERS })).ok()).toBeTruthy()
      await page.goto('/#/play')
      await page.locator('[data-game]').first().waitFor()
      await page.mouse.move(0, 0)
      return { page, ctx }
    }

    const off: string[] = []
    const check = async (page: Page, label: string, tile: Locator, radii: Radii) => {
      const r = await offCentre(page, tile, radii)
      if (!r) return off.push(`${label}: nothing drawn`)
      if (r.cutOff) off.push(`${label}: cut off by the tile`)
      if (Math.abs(r.dx) > TOLERANCE_PX || Math.abs(r.dy) > TOLERANCE_PX) off.push(`${label}: off by ${r.dx}px across, ${r.dy}px down`)
    }

    const { page, ctx } = await play()
    const ids = await page.locator('[data-game]').evaluateAll(els => els.map(e => e.getAttribute('data-game')!))
    const strips = await page.locator('[data-game].mini').evaluateAll(els => els.map(e => e.getAttribute('data-game')!))
    expect(strips.length).toBeGreaterThan(0)
    for (const id of strips) {
      const card = page.locator(`[data-game="${id}"]`)
      await check(page, `${id} strip`, card.locator('.img'), await radiiOf(card, true))
    }
    const playable = await page.locator('[data-game][aria-disabled="false"]').evaluateAll(els => els.map(e => e.getAttribute('data-game')!))
    await ctx.close()

    for (const id of ids.filter(id => playable.includes(id))) {
      const { page, ctx } = await play()
      await page.locator(`[data-game="${id}"]`).click()
      const tile = page.locator(`[data-game-art="${id}"]`)
      await tile.waitFor()
      await page.mouse.move(0, 0)
      await check(page, `${id} settings header`, tile, await radiiOf(tile))
      await ctx.close()
    }
    expect(off).toEqual([])
  })
}
