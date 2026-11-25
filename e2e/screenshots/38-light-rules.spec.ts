// The rule editor (Settings-Lights-Rules), against a mocked lights API: two paired WLEDs that reported
// their effects (one an older WLED that lacks some), an online bridge, and a profile of the player's
// own, "Friday night". The scene adds the 180 rule through the editor, drags it above 100+, moves a
// rule with the keyboard, shows every look, the effect picker, a refused raw JSON and a test playing.
import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { open, shot } from './helpers.js'

type Rule = { when: Record<string, unknown>; type: string; enabled: boolean; look: Record<string, unknown>; holdMs?: number }

const EFFECTS = [
  'Solid',
  'Blink',
  'Breathe',
  'Wipe',
  'Wipe Random',
  'Random Colors',
  'Sweep',
  'Dynamic',
  'Colorloop',
  'Rainbow',
  'Scan',
  'Scan Dual',
  'Fade',
  'Theater',
  'Theater Rainbow',
  'Running',
  'Saw',
  'Twinkle',
  'Dissolve',
  'Dissolve Rnd',
  'Sparkle',
  'Sparkle Dark',
  'Sparkle+',
  'Strobe',
  'Strobe Rainbow',
  'Strobe Mega',
  'Blink Rainbow',
  'Android',
  'Chase',
  'Chase Random',
  'Chase Rainbow',
  'Chase Flash',
  'Chase Flash Rnd',
  'Rainbow Runner',
  'Colorful',
  'Traffic Light',
  'Sweep Random',
  'Chase 2',
  'Aurora',
  'Stream',
  'Scanner',
  'Lighthouse',
  'Fireworks',
  'Rain',
  'Tetrix',
  'Fire Flicker',
  'Gradient',
  'Loading',
  'Rolling Balls',
  'Fairy',
  'Two Dots',
  'Fairytwinkle',
  'Running Dual',
  'RSVD',
  'Chase 3',
  'Tri Wipe',
  'Tri Fade',
  'Lightning',
  'ICU',
  'Multi Comet',
  'Scanner Dual',
  'Stream 2',
  'Oscillate',
  'Pride 2015',
  'Juggle',
  'Palette',
  'Fire 2012',
  'Colorwaves',
  'Bpm',
  'Fill Noise',
  'Noise 1',
  'Noise 2',
  'Noise 3',
  'Noise 4',
  'Colortwinkles',
  'Lake',
  'Meteor',
  'Meteor Smooth',
  'Railway',
  'Ripple',
  'Twinklefox',
  'Twinklecat',
  'Halloween Eyes',
  'Solid Pattern',
  'Solid Pattern Tri',
  'Spots',
  'Spots Fade',
  'Glitter',
  'Candle',
  'Fireworks Starburst',
  'Fireworks 1D',
  'Bouncing Balls',
  'Sinelon',
  'Sinelon Dual',
  'Sinelon Rainbow',
  'Popcorn',
  'Drip',
  'Plasma',
  'Percent',
  'Ripple Rainbow',
  'Heartbeat',
  'Pacifica',
  'Candle Multi',
  'Solid Glitter',
  'Sunrise',
  'Phased',
  'Twinkleup',
  'Noise Pal',
  'Sine',
  'Phased Noise',
  'Flow',
  'Chunchun',
  'Dancing Shadows',
  'Washing Machine',
  'RSVD',
  'Blends',
  'TV Simulator',
  'Dynamic Smooth',
]
const PALETTES = [
  'Default',
  '* Random Cycle',
  '* Color 1',
  '* Colors 1&2',
  '* Color Gradient',
  '* Colors Only',
  'Party',
  'Cloud',
  'Lava',
  'Ocean',
]

const device = (over: Record<string, unknown>) => ({
  mac: 'a8032a7f3a2c',
  version: '0.15.0',
  segments: 1,
  segmentMode: 'whole',
  maxBri: 178,
  reachable: true,
  since: new Date().toISOString(),
  palettes: PALETTES,
  ...over,
})

const SEAT_COLORS = ['#c6f24e', '#efeee6', '#ff9b45', '#5ad1e6', '#7c5cff', '#2ecf8f']

const fridayNight = (): Rule[] => [
  { when: { trigger: 'turn', seats: 'mine' }, type: 'scene', enabled: true, look: { color: 'seat', fx: 0, bri: 255 } },
  {
    when: { trigger: 'visit', seats: 'mine', total: { op: '>=', n: 100 } },
    type: 'flash',
    enabled: true,
    look: { color: 'seat', fx: 2, bri: 255 },
    holdMs: 2000,
  },
  { when: { trigger: 'bust', seats: 'mine' }, type: 'flash', enabled: true, look: { color: '#ff3b30', fx: 1, bri: 255 }, holdMs: 1500 },
  { when: { trigger: 'checkout', seats: 'mine' }, type: 'flash', enabled: true, look: { color: 'seat', fx: 20, bri: 255 }, holdMs: 3000 },
  { when: { trigger: 'takeout.started', seats: 'any' }, type: 'scene', enabled: true, look: { color: '#ffffff', fx: 0, bri: 255 } },
  { when: { trigger: 'lobby', seats: 'any' }, type: 'scene', enabled: true, look: { pl: 3 } },
]

/** The lights API of one board, answered from memory: what the page saves comes back on the next poll. */
async function mockLights(page: Page, boardId: string) {
  const state = {
    rules: fridayNight(),
    saves: [] as Rule[][],
    tests: [] as unknown[],
  }
  const lights = () => ({
    enabled: true,
    bridgeOnline: true,
    bridgeOutdated: false,
    devices: [
      device({ id: 'd1', name: 'Dartboard ring', host: '192.168.1.48', leds: 120, effects: EFFECTS }),
      // An older WLED: its list stops before the newest effects
      device({
        id: 'd2',
        mac: 'a8032a7f3a99',
        name: 'Shelf strip',
        host: '192.168.1.61',
        leds: 60,
        version: '0.14.4',
        segments: 2,
        segmentMode: 'perSeat',
        effects: EFFECTS.slice(0, 101),
      }),
    ],
    found: [],
    lastScanAt: new Date(Date.now() - 120_000).toISOString(),
    probe: null,
    scanError: null,
    profile: { id: 'p-friday', name: 'Friday night', builtIn: false, seatColors: SEAT_COLORS, rules: state.rules },
    profiles: [
      { id: 'default', name: 'Dartcade default', builtIn: true },
      { id: 'p-friday', name: 'Friday night', builtIn: false },
    ],
  })
  await page.route(`**/api/boards/${boardId}/lights**`, async (route: Route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'GET' && path.endsWith('/lights')) return route.fulfill({ json: lights() })
    if (req.method() === 'PUT' && path.endsWith('/profiles/p-friday')) {
      const body = req.postDataJSON() as { rules?: Rule[] }
      if (body.rules) {
        state.rules = body.rules
        state.saves.push(body.rules)
      }
      return route.fulfill({ status: 204 })
    }
    if (req.method() === 'POST' && path.endsWith('/test')) {
      state.tests.push(req.postDataJSON())
      return route.fulfill({ status: 202 })
    }
    return route.fulfill({ status: 404, json: { error: 'not mocked' } })
  })
  return state
}

const triggers = (rules: Rule[]) => rules.map(r => `${String(r.when.trigger)}${r.when.total ? (r.when.total as { n: number }).n : ''}`)

for (const [view, name] of [
  [{ width: 1440, height: 1500, scale: 2 }, 'desktop'],
  [{ width: 390, height: 2000, scale: 2 }, 'phone'],
] as const) {
  test(`light rules: build a Friday night profile, drag 180 above 100+, every look (${name})`, async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', view)
    const { boards } = (await (await page.request.get('/api/boards')).json()) as { boards: { id: string }[] }
    const state = await mockLights(page, boards[0].id)
    // The mocked bridge is online, so the board is too
    await page.route('**/api/boards', async route => {
      const res = await route.fetch()
      const body = (await res.json()) as { boards: Record<string, unknown>[] }
      await route.fulfill({ json: { ...body, boards: body.boards.map(b => ({ ...b, online: true })) } })
    })
    await page.goto(`/#/settings/lights?board=${boards[0].id}`)
    const card = page.getByRole('region', { name: 'Light profile' })
    await expect(card.getByRole('button', { name: /^Edit rule 6: Lobby/ })).toBeVisible()
    await shot(page, `lights/rules-${name}.png`)

    // + Add rule: a visit of exactly 180 on any seat flashes Fireworks in a fixed orange for 4 s
    await card.getByRole('button', { name: 'Add rule' }).click()
    const editor = page.getByRole('dialog')
    await expect(editor.getByText('Friday night profile · rule 7 of 7')).toBeVisible()
    await editor.getByRole('button', { name: 'Visit total' }).click()
    await page.getByRole('option', { name: '=', exact: true }).click()
    await editor.getByRole('spinbutton', { name: 'Total' }).fill('180')
    await editor.getByRole('button', { name: 'Whose seat' }).click()
    await page.getByRole('option', { name: 'any seat' }).click()
    await editor.getByRole('button', { name: 'Fixed' }).click()
    await editor.getByLabel('Fixed colour').fill('#ff9b45')
    await editor.getByRole('button', { name: 'Effect' }).click()
    await expect(page.getByRole('option', { name: 'Fireworks #42' })).toBeVisible()
    await shot(page, `lights/effect-picker-${name}.png`)
    await page.getByRole('option', { name: 'Fireworks #42' }).click()
    await expect(editor.getByRole('status')).toContainText('Fireworks #42')
    await shot(page, `lights/editor-colour-${name}.png`)

    // Test on board plays the rule as it stands, not saved yet
    await editor.getByRole('button', { name: '▶ Test on board' }).click()
    await expect(editor.getByText('▶ Playing on the board now')).toBeVisible()
    expect(state.tests.at(-1)).toMatchObject({
      draft: { when: { trigger: 'visit', total: { op: '=', n: 180 } }, look: { color: '#ff9b45', fx: 42 } },
    })
    await shot(page, `lights/test-playing-${name}.png`)

    await editor.getByRole('button', { name: 'Save rule' }).click()
    await expect(editor).toBeHidden()
    await expect(card.getByRole('button', { name: /^Edit rule 7: Visit scored/ })).toBeVisible()
    expect(triggers(state.rules)).toEqual(['turn', 'visit100', 'bust', 'checkout', 'takeout.started', 'lobby', 'visit180'])

    // Drag the 180 rule above 100+: the first matching rule wins
    const grip = card.getByRole('button', { name: 'Reorder rule 7, Visit scored = 180' })
    // Away from the edges, where a drag scrolls the page
    await grip.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const from = await grip.boundingBox()
    if (!from) throw new Error('no grip')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 4 })
    // Measured once the drag runs: aim at the top quarter of the 100+ row
    const to = await card
      .locator('[data-sortable-id]')
      .filter({ has: page.getByRole('button', { name: /^Reorder rule 2, Visit scored ≥ 100/ }) })
      .boundingBox()
    if (!to) throw new Error('no target')
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 4, { steps: 12 })
    await page.mouse.up()
    await expect.poll(() => triggers(state.rules)).toEqual(['turn', 'visit180', 'visit100', 'bust', 'checkout', 'takeout.started', 'lobby'])
    await expect(card.getByRole('button', { name: /^Edit rule 2: Visit scored/ })).toBeVisible()
    await expect(card.getByRole('status')).toHaveText('Saved')
    await shot(page, `lights/rules-reordered-${name}.png`)

    // The keyboard does the same: the grip takes the arrow keys
    await card.getByRole('button', { name: /^Reorder rule 4, Bust/ }).focus()
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => triggers(state.rules)).toEqual(['turn', 'visit180', 'visit100', 'checkout', 'bust', 'takeout.started', 'lobby'])

    // Every look, on the 100+ rule
    await card.getByRole('button', { name: /^Edit rule 3: Visit scored/ }).click()
    await editor.getByRole('button', { name: 'Effect' }).click()
    await page.getByRole('option', { name: 'Flow #110' }).click()
    await expect(editor.getByText('Not on Shelf strip: it plays Solid instead.')).toBeVisible()
    await shot(page, `lights/editor-missing-effect-${name}.png`)
    await editor.getByRole('radio', { name: 'WLED preset' }).click()
    await editor.getByRole('spinbutton', { name: 'Preset id' }).fill('12')
    await shot(page, `lights/editor-preset-${name}.png`)
    await editor.getByRole('radio', { name: 'Playlist' }).click()
    await editor.getByRole('spinbutton', { name: 'Playlist id' }).fill('3')
    await shot(page, `lights/editor-playlist-${name}.png`)
    await editor.getByRole('radio', { name: 'Raw JSON' }).click()
    await editor
      .getByRole('textbox', { name: 'WLED state (JSON)' })
      .fill('{\n  "on": true,\n  "bri": 200,\n  "psave": 4,\n  "seg": [{ "id": 0, "fx": 42, "col": [[255, 155, 69]] }]\n}')
    await expect(editor.getByRole('list', { name: 'What to fix' })).toContainText('psave is not allowed')
    await expect(editor.getByRole('button', { name: 'Save rule' })).toBeDisabled()
    await shot(page, `lights/editor-raw-${name}.png`)

    // Closing with changes asks first
    await editor.getByRole('button', { name: 'Cancel' }).click()
    await expect(editor.getByRole('alertdialog', { name: 'Discard changes' })).toBeVisible()
    await editor.getByRole('button', { name: 'Discard' }).click()
    await expect(editor).toBeHidden()
    expect(state.saves).toHaveLength(3)
    await ctx.close()
  })
}
