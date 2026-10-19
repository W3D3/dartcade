import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import GameSettings from '../components/GameSettings.svelte'
import { hiloModule } from '../../../../src/games/hilo.js'

// See gameSettingsBotSpeed.test.ts: bits-ui's barrel crashes SSR here
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
  Popover: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe("GameSettings' Higher Lower toggles", () => {
  const props = {
    gameId: 'hilo',
    config: hiloModule.defaultConfig,
    defaults: hiloModule.defaultConfig,
    meta: hiloModule.configMeta ?? {},
  }

  it('offers the Keep bars option, off by default', () => {
    const body = render(GameSettings, { props }).body
    expect(body).toContain('Keep bars after a life lost')
  })
})
