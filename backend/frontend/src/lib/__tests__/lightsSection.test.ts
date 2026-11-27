import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import type { LightProfile } from '$lib/api'
import LightProfileCard from '../components/lights/LightProfileCard.svelte'
import RuleEditor from '../components/lights/RuleEditor.svelte'
import type { LightRule } from '$lib/api'

// The attribute, not the `disabled:` classes every button carries
const DISABLED = /\sdisabled(?:=|\s|$)/
const handlers = {
  profiles: [{ id: 'default', name: 'Dartcade default', builtIn: true }],
  ontest: () => {},
  onseatcolor: () => {},
  onresetseatcolors: () => {},
  onenabled: () => {},
  onselect: () => {},
  onduplicate: () => {},
  onimport: () => {},
  onexport: () => {},
  ondelete: () => {},
  onrename: () => {},
  onreset: () => {},
  onedit: () => {},
  onadd: () => {},
  onmove: () => Promise.resolve(true),
}
const profile: LightProfile = { ...DEFAULT_PROFILE, seatColors: [...DEFAULT_PROFILE.seatColors], builtIn: true }
const own: LightProfile = { ...profile, id: 'p1', name: 'Friday night', builtIn: false }

describe('LightProfileCard', () => {
  it("shows the built-in default's 15 rules, and Duplicate, Import and Export are on", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    expect(html).toContain('Dartcade default')
    expect(html).toContain('built in')
    for (let i = 1; i <= 15; i++) expect(html).toContain(`>${i}<`)
    for (const label of ['Duplicate', 'Import', 'Export']) {
      const attrs = new RegExp(`<button([^>]*)>(?:<!--[^>]*-->)*\\s*${label}`).exec(html)?.[1]
      expect(attrs).toBeDefined()
      expect(attrs).not.toMatch(DISABLED)
    }
    expect(html).toContain('aria-label="Light profile file to import"')
  })

  it('offers Rename, Reset and Delete (the ⋯ menu) only for a profile of the player’s own, and shows its name', () => {
    expect(render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body).not.toContain('More for')
    const html = render(LightProfileCard, {
      props: {
        profile: own,
        canTest: true,
        ...handlers,
        profiles: [...handlers.profiles, { id: 'p1', name: 'Friday night', builtIn: false }],
      },
    }).body
    expect(html).toContain('Friday night')
    expect(html).toContain('aria-label="More for Friday night"')
  })

  it('says the built-in profile cannot be edited, and never touches presets', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    expect(html).toContain("The built-in default can't be edited and never touches your WLED presets. Duplicate it to make your own.")
    expect(html).not.toContain('Add rule')
    expect(html).not.toContain('data-sortable-handle')
  })

  describe('a profile of the player’s own', () => {
    const card = (p: LightProfile, saved = false) =>
      render(LightProfileCard, { props: { profile: p, canTest: true, saved, ...handlers } }).body

    it('lists its rules in match order with a grip, Edit and Test each, then Add rule and the note on order', () => {
      const html = card(own)
      expect([...html.matchAll(/\sdata-sortable-handle[\s>=]/g)]).toHaveLength(own.rules.length)
      expect([...html.matchAll(/aria-label="Edit rule \d+:/g)]).toHaveLength(own.rules.length)
      expect(html).toContain('aria-label="Reorder rule 8, Visit scored = 180"')
      expect(html.indexOf('Edit rule 8: Visit scored')).toBeLessThan(html.indexOf('Edit rule 9: Visit scored'))
      expect(html).toContain('Add rule')
      expect(html).toContain('The first matching rule wins, so keep specific rules (180) above general ones (100+). Drag to reorder.')
      expect(html).not.toContain("can't be edited")
    })

    it('shows each rule’s look with its colours, and the new looks by name', () => {
      const rules: LightRule[] = [
        {
          when: { trigger: 'visit', seats: 'any', total: { op: 'between', n: 100, to: 139 } },
          type: 'flash',
          enabled: true,
          look: { color: '#ff3b30', fx: 1, bri: 255 },
          holdMs: 1500,
        },
        { when: { trigger: 'lobby', seats: 'any' }, type: 'scene', enabled: true, look: { pl: 3 } },
        { when: { trigger: 'bust', seats: 'mine' }, type: 'flash', enabled: true, look: { ps: 7 }, holdMs: 1500 },
        {
          when: { trigger: 'checkout', seats: 'mine' },
          type: 'flash',
          enabled: true,
          look: { raw: { seg: [{ id: 0, col: [[0, 255, 0]] }] } },
          holdMs: 1500,
        },
      ]
      const html = card({ ...own, rules })
      for (const text of ['100–139', 'red · blink · 1.5 s', 'playlist 3', 'strip preset 7 · 1.5 s', 'raw JSON · 1.5 s'])
        expect(html).toContain(text)
      expect(html).toContain('background: #ff3b30')
      expect(html).toContain('background: #00ff00')
    })

    it('says when it is empty, and when it was saved', () => {
      expect(card({ ...own, rules: [] })).toContain('No rules yet')
      expect(card(own, true)).toContain('Saved')
      expect(card(own)).not.toContain('>Saved<')
    })
  })

  it("every ▶ Test button is disabled when lights can't be tested (bridge offline)", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: false, ...handlers } }).body
    const testButtons = [...html.matchAll(/<button([^>]*aria-label="Test rule \d+:[^"]*"[^>]*)>/g)]
    expect(testButtons.length).toBe(DEFAULT_PROFILE.rules.length)
    for (const [, attrs] of testButtons) expect(attrs).toContain('disabled')
  })

  it('names the rule in each Test button, including its filter chip', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    expect(html).toContain('aria-label="Test rule 8: Visit scored = 180"')
    expect(html).toContain('aria-label="Test rule 10: Bust"')
  })

  it("truncates a long 'when' label instead of letting its filter chip overflow into the type badge", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    // Row 2: Turn changes · other board — the chip must stay intact (shrink-0) while the label truncates
    const row = /<span class="truncate">Turn changes<\/span>(?:\s|<!--[^>]*-->)*<span class="shrink-0[^"]*">\s*other board/.exec(html)
    expect(row).not.toBeNull()
  })

  it('lists the Seat colours group above the effects, one row per seat with its colour', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    const colors = html.indexOf('aria-label="Seat colours"')
    const effects = html.indexOf('>Effects<')
    expect(colors).toBeGreaterThan(-1)
    expect(effects).toBeGreaterThan(colors)
    expect(html.indexOf('>1<')).toBeGreaterThan(effects) // the effect rows come after both
    for (const [i, name] of ['cyan', 'off-white', 'orange', 'pink', 'violet', 'green'].entries())
      expect(html).toContain(`aria-label="Seat ${i + 1} colour: ${name}. Change"`)
  })

  it('groups the effects by game, each group with its own heading and effects', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    const headings = ['General', 'X01', 'Cricket', '121', 'Minigolf', 'Higher Lower'].map(t => html.indexOf(`aria-label="${t} effects"`))
    expect(headings.every(h => h > -1)).toBe(true)
    expect(headings).toEqual([...headings].sort((a, b) => a - b)) // in the order of the groups
    expect(html).not.toContain('Around the Clock effects') // no effect there since Target hit went
    const minigolf = html.slice(headings[4], headings[5])
    expect(minigolf).toContain('Ball sunk')
    expect(minigolf).not.toContain('Life lost')
    expect(html.slice(headings[5])).toContain('Life lost')
  })

  it('says what happens with more seats than colours', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body
    expect(html).toContain('A game with more than 6 seats starts over from seat 1')
  })

  it('Reset to defaults is disabled for the built-in colours and enabled once one is changed', () => {
    const reset = (p: LightProfile) =>
      /<button([^>]*)>(?:<!--[^>]*-->)*\s*Reset to defaults/.exec(
        render(LightProfileCard, { props: { profile: p, canTest: true, ...handlers } }).body,
      )?.[1]
    expect(reset(profile)).toMatch(DISABLED)
    expect(reset({ ...profile, seatColors: ['#ff0000', ...profile.seatColors.slice(1)] })).not.toMatch(DISABLED)
  })

  describe('the switches', () => {
    const switches = (p: LightProfile) =>
      [
        ...render(LightProfileCard, { props: { profile: p, canTest: true, ...handlers } }).body.matchAll(
          /<button([^>]*role="switch"[^>]*)>/g,
        ),
      ].map(m => m[1])

    it('has one per effect, named after the effect, on for the effects that ship on', () => {
      const all = switches(profile)
      expect(all).toHaveLength(profile.rules.length)
      expect(all.filter(a => a.includes('aria-checked="true"'))).toHaveLength(profile.rules.filter(r => r.enabled).length)
      expect(all.some(a => a.includes('aria-label="Visit scored = 180 on"') && a.includes('aria-checked="true"'))).toBe(true)
      expect(all.some(a => a.includes('aria-label="Lobby on"') && a.includes('aria-checked="false"'))).toBe(true)
    })

    it('shows an effect that was switched off as off, and keeps its Test button', () => {
      const off: LightProfile = { ...profile, rules: profile.rules.map(r => (r.when.trigger === 'bust' ? { ...r, enabled: false } : r)) }
      const all = switches(off)
      expect(all.some(a => a.includes('aria-label="Bust on"') && a.includes('aria-checked="false"'))).toBe(true)
      const html = render(LightProfileCard, { props: { profile: off, canTest: true, ...handlers } }).body
      expect(html).toContain('aria-label="Test rule 10: Bust"')
    })
  })
})

describe('RuleEditor', () => {
  const editor = (rule: LightRule, extra: Record<string, unknown> = {}) =>
    render(RuleEditor, {
      props: {
        rule,
        profileName: 'Friday night',
        position: 2,
        count: 7,
        devices: [
          {
            id: 'd1',
            mac: 'aa',
            name: 'Dartboard ring',
            host: '192.168.1.48',
            leds: 120,
            version: '0.15.0',
            segments: 1,
            segmentMode: 'whole',
            maxBri: 178,
            reachable: true,
            effects: ['Solid', 'Blink', 'Breathe'],
            palettes: ['Default'],
          },
        ],
        seatColors: profile.seatColors,
        canTest: true,
        ontest: () => {},
        onsave: () => Promise.resolve(null),
        ondelete: () => {},
        onclose: () => {},
        ...extra,
      },
    }).body
  const base: LightRule = {
    when: { trigger: 'visit', seats: 'any', total: { op: '=', n: 180 }, game: 'x01' },
    type: 'flash',
    enabled: true,
    look: { color: 'seat', fx: 2, bri: 255 },
    holdMs: 4000,
  }

  it('opens on the rule: title, its place, the trigger and the colour and effect from the devices', () => {
    const html = editor(base)
    expect(html).toContain('Edit rule')
    expect(html).toContain('Friday night profile · rule 2 of 7')
    expect(html).toContain('Visit scored · X01')
    expect(html).toContain('Effect · from your devices')
    expect(html).toContain('Breathe #2')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Seat colour')
    expect(html).toContain('4.0 s')
    expect(html).toContain('Test on board')
    expect(html).toContain('Delete rule')
  })

  it('an effect a device lacks says it plays Solid there', () => {
    expect(editor({ ...base, look: { color: 'seat', fx: 42, bri: 255 } })).toContain('Not on Dartboard ring: it plays Solid instead.')
  })

  it('shows the fields of each look', () => {
    expect(editor({ ...base, look: { ps: 7 } })).toContain('Preset id')
    expect(editor({ ...base, look: { preset: '180' } })).toContain('Dartcade preset')
    expect(editor({ ...base, look: { pl: 3 } })).toContain('Playlist id')
    const raw = editor({ ...base, look: { raw: { on: true } } })
    expect(raw).toContain('WLED state (JSON)')
    expect(raw).toMatch(/Nothing that saves,\s+deletes\s+or\s+reboots/)
  })

  it('a scene has no hold time; Add rule has no Delete; Test is off while the board cannot play it', () => {
    expect(editor({ ...base, type: 'scene', holdMs: undefined })).not.toContain('id="rule-hold"')
    const added = editor(base, { ondelete: undefined })
    expect(added).toContain('Add rule')
    expect(added).not.toContain('Delete rule')
    expect(editor(base, { canTest: false })).toContain('Testing needs the lights on and the bridge online.')
  })
})
