import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import BattleScreen from '$lib/components/dungeon/BattleScreen.svelte'
import { dart, fight, game, resolved } from './dungeonFixtures'

// In the browser: the resolved visit's popup plays on timers and each damage beat fires a pixel effect,
// which has to travel BattleScreen → BattleStage → FxLayer (the server render never runs either)
describe('the damage popup in the browser', () => {
  afterEach(() => vi.useRealTimers())

  it("fires the first dart's hit on the stage's effect layer once its damage lands", () => {
    vi.useFakeTimers()
    const darts = [dart('S19', 19, 1, 19), dart('D20', 20, 2, 40), dart('Miss', 0, 0, 0)]
    const target = document.createElement('div')
    const app = mount(BattleScreen, { target, props: fight(game({ visitLocked: true, trace: resolved.trace, currentVisitDarts: darts })) })
    flushSync()
    const layer = () => target.querySelector('[data-testid="battle-stage"] canvas')
    expect(layer()?.getAttribute('data-shot')).toBeNull()
    // The dart, its three chips (rune, Brawler, Weak) and its damage beat
    for (let i = 0; i < 6; i++) {
      vi.runOnlyPendingTimers()
      flushSync()
    }
    expect(layer()?.getAttribute('data-shot')).toBe('crit')
    void unmount(app)
  })

  // Skipping changes the layout (the skip button goes, a phone's board comes back): on pointerdown it
  // moved a phone's keypad before the click, so a tap on Next hit another key or nothing
  it('lets a tap on Next land before it skips the popup', () => {
    vi.useFakeTimers()
    const onNext = vi.fn()
    const darts = [dart('S19', 19, 1, 19), dart('D20', 20, 2, 40), dart('Miss', 0, 0, 0)]
    const target = document.createElement('div')
    document.body.append(target)
    const props = { ...fight(game({ visitLocked: true, trace: resolved.trace, currentVisitDarts: darts })), onNext }
    const app = mount(BattleScreen, { target, props })
    flushSync()
    const skipButton = () => [...target.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tap anywhere to skip')
    const nextButton = [...target.querySelectorAll('button')].find(b => b.textContent.includes('Next player'))
    expect(skipButton()).toBeDefined()
    nextButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    flushSync()
    expect(skipButton(), 'nothing moves on pointerdown').toBeDefined()
    nextButton?.click()
    flushSync()
    expect(onNext).toHaveBeenCalledOnce()
    expect(skipButton(), 'the click skips the popup').toBeUndefined()
    void unmount(app)
    target.remove()
  })
})
