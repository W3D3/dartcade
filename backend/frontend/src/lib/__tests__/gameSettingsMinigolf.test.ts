import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import GameSettings from '../components/GameSettings.svelte'
import { minigolfModule } from '../../../../src/games/minigolf.js'

// See gameSettingsBotSpeed.test.ts: bits-ui's barrel crashes SSR here
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))

describe("GameSettings' Minigolf courses", () => {
  const props = {
    gameId: 'minigolf',
    config: minigolfModule.defaultConfig,
    defaults: minigolfModule.defaultConfig,
    meta: minigolfModule.configMeta ?? {},
  }

  it("offers Minigolf's courses as the server lists them", () => {
    const course = {
      label: 'Course',
      options: [
        { value: '01J9', label: 'Canal Street' },
        { value: 'mixed', label: 'Mixed course' },
      ],
    }
    const body = render(GameSettings, { props: { ...props, meta: { ...props.meta, course } } }).body
    expect(body).toContain('Canal Street')
    expect(body).toContain('9 random holes from all courses')
    expect(body).not.toContain('>Test<')
  })

  it("doesn't count a course's holes from the code's copy of it (an editor may have changed it)", () => {
    const course = { label: 'Course', options: [{ value: 'test', label: 'Test' }] }
    const body = render(GameSettings, { props: { ...props, meta: { ...props.meta, course } } }).body
    expect(body).toContain('Test')
    expect(body).not.toContain('4 holes')
  })
})
