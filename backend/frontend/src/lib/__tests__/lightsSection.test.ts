import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import type { LightProfile } from '$lib/api'
import LightProfileCard from '../components/lights/LightProfileCard.svelte'

const profile: LightProfile = { ...DEFAULT_PROFILE, builtIn: true }

describe('LightProfileCard', () => {
  it("shows the built-in default's 14 rules, disabled Duplicate/Import/Export", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ontest: () => {} } }).body
    expect(html).toContain('Dartcade default')
    expect(html).toContain('built in')
    for (let i = 1; i <= 14; i++) expect(html).toContain(`>${i}<`)
    for (const label of ['Duplicate', 'Import', 'Export']) {
      const attrs = new RegExp(`<button([^>]*)>(?:<!--[^>]*-->)*\\s*${label}`).exec(html)?.[1]
      expect(attrs).toBeDefined()
      expect(attrs).toContain('disabled')
    }
  })

  it("every ▶ Test button is disabled when lights can't be tested (bridge offline)", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: false, ontest: () => {} } }).body
    const testButtons = [...html.matchAll(/<button([^>]*aria-label="Test rule \d+:[^"]*"[^>]*)>/g)]
    expect(testButtons.length).toBe(14)
    for (const [, attrs] of testButtons) expect(attrs).toContain('disabled')
  })

  it('names the rule in each Test button, including its filter chip', () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ontest: () => {} } }).body
    expect(html).toContain('aria-label="Test rule 3: Visit scored = 180"')
    expect(html).toContain('aria-label="Test rule 5: Bust"')
  })

  it("truncates a long 'when' label instead of letting its filter chip overflow into the type badge", () => {
    const html = render(LightProfileCard, { props: { profile, canTest: true, ontest: () => {} } }).body
    // Row 2: Turn changes · other board — the chip must stay intact (shrink-0) while the label truncates
    const row = /<span class="truncate">Turn changes<\/span>(?:\s|<!--[^>]*-->)*<span class="shrink-0[^"]*">\s*other board/.exec(html)
    expect(row).not.toBeNull()
  })
})
