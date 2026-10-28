import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import GameSettings from '../components/GameSettings.svelte'
import { configMeta, x01Game } from '../../../../src/games/x01.js'

// The bot speed options carry tooltips, which need the Tooltip.Provider that App mounts
vi.mock('bits-ui', async importOriginal => ({
  ...(await importOriginal<typeof import('bits-ui')>()),
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
