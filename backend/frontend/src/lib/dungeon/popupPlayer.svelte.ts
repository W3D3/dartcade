// Plays the damage popup: the resolved visit's trace beat by beat (BEAT_MS apart), a new trace (its
// `key`) from the start, reduced motion straight to the end, skip() to the end. `popup` is what the
// popup shows now, `cue` the pixel effect the last beat fired. Create it in a component's script.
import { untrack } from 'svelte'
import type { DungeonTrace } from '$lib/api/game-ws'
import { reducedMotion, type FxCue } from './fx/effects'
import { BEAT_MS, beatsOf, fxOf, popupAt } from './popup'

export class PopupPlayer {
  #at = $state({ key: '', beat: 0 })
  cue = $state<FxCue | null>(null)
  readonly popup
  readonly running

  constructor(source: () => { trace: DungeonTrace; key: string } | null) {
    const beat = () => {
      const s = source()
      return s && this.#at.key === s.key ? this.#at.beat : 0
    }
    this.popup = $derived.by(() => {
      const s = source()
      return s ? popupAt(s.trace, beat()) : null
    })
    this.running = $derived(this.popup !== null && !this.popup.done)

    $effect(() => {
      const s = source()
      untrack(() => {
        if (s && this.#at.key !== s.key) this.#at = { key: s.key, beat: reducedMotion() ? Infinity : 0 }
      })
    })
    $effect(() => {
      const s = source()
      if (!s || !this.running) return
      const n = beat()
      const beats = beatsOf(s.trace)
      const timer = setTimeout(
        () => {
          this.#at = { key: s.key, beat: n + 1 }
          const fx = n < beats.length ? fxOf(beats[n], s.trace) : null
          if (fx) this.cue = { ...fx, id: (untrack(() => this.cue?.id) ?? 0) + 1 }
        },
        n === 0 ? 300 : BEAT_MS[beats[n - 1].kind],
      )
      return () => clearTimeout(timer)
    })
  }

  skip(): void {
    if (this.running) this.#at = { ...this.#at, beat: Infinity }
  }
}
