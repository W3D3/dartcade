import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import GameSettings from '../components/GameSettings.svelte'
import { configMeta, x01Game } from '../../../../src/games/x01.js'

// SegmentedControl's Tooltip option pulls in bits-ui's whole barrel (Select included), whose
// select-viewport.svelte crashes this toolchain's SSR CSS preprocessing outside the main pipeline
// (a pre-existing Vite 6 / @sveltejs/vite-plugin-svelte 5 issue, unrelated to this component).
// Stubbing it out sidesteps the crash; the tooltip branch isn't used here anyway.
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe('GameSettings botSpeed field', () => {
  const baseProps = {
    gameId: 'x01',
    config: x01Game.defaultConfig,
    defaults: x01Game.defaultConfig,
    meta: configMeta,
  }

  it('is hidden when hasBot is false', () => {
    const out = render(GameSettings, { props: { ...baseProps, hasBot: false } }).body
    expect(out).not.toContain('Bot speed')
  })

  it('is shown when hasBot is true', () => {
    const out = render(GameSettings, { props: { ...baseProps, hasBot: true } }).body
    expect(out).toContain('Bot speed')
  })
})
