import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { readable } from 'svelte/store'
import GameSettings from '../components/GameSettings.svelte'
import { minigolfModule } from '../../../../src/games/minigolf.js'

// See gameSettingsBotSpeed.test.ts: bits-ui's barrel crashes SSR here
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))
const flags = vi.hoisted(() => new Set<string>())
vi.mock('$lib/flags', () => ({ flag: (key: string) => readable(flags.has(key)) }))

describe('GameSettings fields behind a flag', () => {
  const props = {
    gameId: 'minigolf',
    config: minigolfModule.defaultConfig,
    defaults: minigolfModule.defaultConfig,
    meta: minigolfModule.configMeta ?? {},
  }

  it('hides Minigolf physics unless gamemode.minigolf.flat is on', () => {
    flags.clear()
    expect(render(GameSettings, { props }).body).not.toContain('Physics')
    flags.add('gamemode.minigolf.flat')
    expect(render(GameSettings, { props }).body).toContain('Physics')
  })
})
