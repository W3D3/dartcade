import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import GameSettings from '../components/GameSettings.svelte'
import { configMeta, cricketGame } from '../../../../src/games/cricket.js'

// The options carry tooltips, which need the Tooltip.Provider that App mounts
vi.mock('bits-ui', async importOriginal => ({
  ...(await importOriginal<typeof import('bits-ui')>()),
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe("GameSettings' Cricket fields", () => {
  const baseProps = {
    gameId: 'cricket',
    config: cricketGame.defaultConfig,
    defaults: cricketGame.defaultConfig,
    meta: configMeta,
  }

  it('offers Mode, First to and Bull off, labelled from the backend', () => {
    const out = render(GameSettings, { props: baseProps }).body
    expect(out).toContain('Mode')
    expect(out).toContain('Standard')
    expect(out).toContain('Cut-throat')
    expect(out).toContain('First to')
    expect(out).toContain('Bull off')
  })

  it('hides Format outside a team game', () => {
    const out = render(GameSettings, { props: { ...baseProps, teams: false } }).body
    expect(out).not.toContain('Format')
  })

  it('shows Format in a team game', () => {
    const out = render(GameSettings, { props: { ...baseProps, teams: true } }).body
    expect(out).toContain('Format')
  })

  it('shows Bot speed only when a bot is in', () => {
    const without = render(GameSettings, { props: { ...baseProps, hasBot: false } }).body
    const with_ = render(GameSettings, { props: { ...baseProps, hasBot: true } }).body
    expect(without).not.toContain('Bot speed')
    expect(with_).toContain('Bot speed')
  })
})
