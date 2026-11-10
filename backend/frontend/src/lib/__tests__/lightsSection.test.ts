import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import type { LightProfile } from '$lib/api'
import LightProfileCard from '../components/lights/LightProfileCard.svelte'

// The attribute, not the `disabled:` classes every button carries
const DISABLED = /\sdisabled(?:=|\s|$)/
const handlers = {
  profiles: [{ id: 'default', name: 'Dartcade default', builtIn: true }],
  ontest: () => {},
  onseatcolor: () => {},
  onresetseatcolors: () => {},
  onselect: () => {},
  onduplicate: () => {},
  onimport: () => {},
  onexport: () => {},
  ondelete: () => {},
}
const profile: LightProfile = { ...DEFAULT_PROFILE, seatColors: [...DEFAULT_PROFILE.seatColors], builtIn: true }

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

  it('offers Delete only for a profile of the player’s own, and shows its name', () => {
    expect(render(LightProfileCard, { props: { profile, canTest: true, ...handlers } }).body).not.toContain('>Delete<')
    const own: LightProfile = { ...profile, id: 'p1', name: 'My lights', builtIn: false }
    const html = render(LightProfileCard, {
      props: {
        profile: own,
        canTest: true,
        ...handlers,
        profiles: [...handlers.profiles, { id: 'p1', name: 'My lights', builtIn: false }],
      },
    }).body
    expect(html).toContain('My lights')
    expect(html).toContain('Delete')
  })

  it("every ▶ Test button is disabled when lights can't be tested (bridge offline)", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: false, ...handlers } }).body
    const testButtons = [...html.matchAll(/<button([^>]*aria-label="Test rule \d+:[^"]*"[^>]*)>/g)]
    expect(testButtons.length).toBe(15)
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
})
