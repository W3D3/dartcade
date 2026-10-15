import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { boardsRedirect, sectionOf, SETTINGS_SECTIONS } from '../settings/sections.js'
import { defaultSettings } from '../gameSettings.js'
import GamePrefs from '../components/settings/GamePrefs.svelte'
import BoardsEmpty from '../components/boards/BoardsEmpty.svelte'

describe('Settings sections', () => {
  it("lists the sections in the design's order, Lights as soon", () => {
    expect(SETTINGS_SECTIONS.map(s => s.id)).toEqual(['profile', 'game', 'boards', 'lights', 'caller'])
    expect(SETTINGS_SECTIONS.find(s => s.id === 'lights')).toMatchObject({ soon: true })
  })

  it('opens a known section; the bare route, Lights and unknown ones are none', () => {
    expect(sectionOf('boards')).toBe('boards')
    expect(sectionOf('caller')).toBe('caller')
    expect(sectionOf(undefined)).toBeNull()
    expect(sectionOf('lights')).toBeNull()
    expect(sectionOf('nope')).toBeNull()
  })

  it('sends the old Boards page to the Boards section, keeping ?pair', () => {
    expect(boardsRedirect('')).toBe('/settings/boards')
    expect(boardsRedirect(undefined)).toBe('/settings/boards')
    expect(boardsRedirect('pair')).toBe('/settings/boards?pair')
  })
})

describe('Game preferences', () => {
  it('shows only switches that have a setting behind them', () => {
    const html = render(GamePrefs, { props: { settings: { ...defaultSettings } } }).body
    for (const label of ['Checkout suggestions', 'Visit sum', 'Chalkboard', "Other players' targets", 'Hit', 'Bust'])
      expect(html).toContain(label)
    for (const label of ['Stats panel', 'Score count animation', 'Highlight target segment', 'New game defaults'])
      expect(html).not.toContain(label)
    expect(html).toContain('Saved on this device')
  })
})

describe('Boards empty state', () => {
  it('links to the bridge install guide and offers the keypad instead', () => {
    const html = render(BoardsEmpty, { props: { onpair: () => {} } }).body
    expect(html).toContain('Connect your first board')
    expect(html).toContain('href="https://github.com/W3D3/dartcade/blob/main/GETTING_STARTED.md#2-install-the-bridge"')
    expect(html).toContain('No Autodarts board?')
  })
})
