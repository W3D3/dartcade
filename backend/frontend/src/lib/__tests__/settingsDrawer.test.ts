// The in-game settings drawer only offers the options of the game being played (#167).
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import SettingsDrawer from '../components/SettingsDrawer.svelte'
import { defaultSettings } from '../gameSettings'

const drawer = (gameId: string, scoreBased = false) =>
  render(SettingsDrawer, { props: { settings: { ...defaultSettings }, gameId, scoreBased, onclose: () => {} } }).body
const switches = (html: string) => [...html.matchAll(/id="setting-(\w+)"/g)].map(m => m[1])
const sounds = (html: string) =>
  [...html.matchAll(/role="checkbox"[^>]*>[\s\S]*?<\/button>(?:\s|<!--[^>]*-->)*([^<]+?)\s*</g)].map(m => m[1])

describe('settings drawer rows follow the game', () => {
  it('Around the Clock: only other players’ targets, no bust', () => {
    const html = drawer('atc')
    expect(switches(html)).toEqual(['showMarkers', 'boardView'])
    expect(sounds(html)).toEqual(['Hit', 'Treble', 'Miss', 'Player switch', 'Win'])
  })

  it('X01: checkout, visit sum, chalkboard, score left, bust and the caller', () => {
    const html = drawer('x01', true)
    expect(switches(html)).toEqual(
      expect.arrayContaining(['checkoutSuggestions', 'visitSum', 'chalkboard', 'boardView', 'scoreUpdates', 'callerOn']),
    )
    expect(switches(html)).not.toContain('showMarkers')
    expect(sounds(html)).toEqual(['Hit', 'Treble', 'Miss', 'Player switch', 'Bust', 'Win'])
  })

  it('Minigolf: its own display rows and the ball sound', () => {
    const html = drawer('minigolf')
    expect(switches(html)).toEqual(['aimDial', 'slowMotion', 'boardView'])
    expect(sounds(html)).toEqual(['Hit', 'Miss', 'Player switch', 'Ball', 'Win'])
  })

  it('121: checkout suggestions, bust and the caller, no X01 board rows', () => {
    const html = drawer('p121', true)
    expect(switches(html)).toEqual(['checkoutSuggestions', 'boardView', 'callerOn', 'callerVoice'])
    expect(sounds(html)).toContain('Bust')
  })

  it('Higher Lower: a lost life sounds as the bust, and the caller', () => {
    const html = drawer('hilo', true)
    expect(switches(html)).toEqual(['boardView', 'callerOn', 'callerVoice'])
    expect(sounds(html)).toContain('Bust')
  })

  it('a game it doesn’t know gets no game-specific rows', () => {
    const html = drawer('newgame')
    expect(switches(html)).toEqual(['boardView'])
    expect(sounds(html)).not.toContain('Bust')
  })
})
