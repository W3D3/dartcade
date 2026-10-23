import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { boardsRedirect, sectionOf, SETTINGS_SECTIONS } from '../settings/sections.js'
import { defaultSettings } from '../gameSettings.js'
import { gameModes } from '../gameModes.js'
import GamePrefs from '../components/settings/GamePrefs.svelte'
import SoundEffects from '../components/settings/SoundEffects.svelte'
import BoardsEmpty from '../components/boards/BoardsEmpty.svelte'

describe('Settings sections', () => {
  it("lists the sections in the design's order, Lights behind its flag", () => {
    expect(SETTINGS_SECTIONS.map(s => s.id)).toEqual(['profile', 'game', 'boards', 'lights', 'caller', 'sounds'])
    expect(SETTINGS_SECTIONS.find(s => s.id === 'lights')).toMatchObject({ flag: 'lights.enabled' })
  })

  it('opens a known section; the bare route and unknown ones are none', () => {
    expect(sectionOf('boards')).toBe('boards')
    expect(sectionOf('caller')).toBe('caller')
    expect(sectionOf('lights')).toBe('lights')
    expect(sectionOf(undefined)).toBeNull()
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
    for (const label of ['Checkout suggestions', 'Visit sum', 'Chalkboard', "Other players' targets"]) expect(html).toContain(label)
    expect(html).not.toContain('Sound effects')
    for (const label of ['Stats panel', 'Score count animation', 'Highlight target segment']) expect(html).not.toContain(label)
    expect(html).not.toContain('Saved on this device')
  })

  it('keeps every sound effect under Sounds, the sound packs only with progression on', () => {
    const html = render(SoundEffects, { props: { settings: { ...defaultSettings } } }).body
    for (const label of ['Effects volume', 'Hit', 'Treble', 'Miss', 'Player switch', 'Bust', 'Win']) expect(html).toContain(label)
    expect(html).not.toContain('Sound packs')
    expect(render(SoundEffects, { props: { settings: { ...defaultSettings }, packs: true } }).body).toContain('Sound packs')
  })

  it("offers X01's own options as New game defaults once the modes are known", () => {
    expect(render(GamePrefs, { props: { settings: { ...defaultSettings } } }).body).not.toContain('New game defaults')
    const opts = (...vs: (string | number)[]) => ({ label: '', options: vs.map(v => ({ value: v, label: String(v) })) })
    gameModes.set([
      {
        id: 'x01',
        defaultConfig: {},
        teams: true,
        supportsBots: true,
        configMeta: { startScore: opts(301, 501, 701), outMode: opts('straight', 'double', 'master'), bullOff: opts('off', 'wdc', 'pdc') },
      },
    ])
    const html = render(GamePrefs, { props: { settings: { ...defaultSettings, x01FirstTo: 7 } } }).body
    for (const label of ['New game defaults', '701', 'master', 'Lobby order', 'Bull off · PDC', '>7<']) expect(html).toContain(label)
    gameModes.set([])
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
