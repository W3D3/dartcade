<script lang="ts">
  // ScoreCount on the canvas: a big number on mechanical digit wheels. Each digit sits on its
  // own drum, faded at the top and bottom edge. Down rolls downward and dips; up rolls upward
  // and lifts, in amber when it's a take-back (undo, correction). A bust flashes red, shakes,
  // then rolls back up. A checkout's 0 turns lime. The value is always the truth: a new one
  // mid-roll snaps to the old target and rolls on from there. Reduced motion: no rolling or
  // dips, only the colours. Sits inside the element that sets the font, size and colour.
  // At rest it is the plain number; the drums are only there while it rolls.
  import { onDestroy, tick, untrack } from 'svelte'
  import { parseRolling, planChange, planDrums, type Drum, type RollOptions, type Tone } from '$lib/rollingNumber'

  let { value, normal = 'down', reset = 0, bust = false, checkout = false, progress }: { value: string | number } & RollOptions = $props()

  const ROLL = 450
  const SETTLE = 'cubic-bezier(.3, 1.25, .55, 1)'
  const SHAKE = 300
  const BUST_HOLD = 1000
  // Three rounds of 0–9
  const CELLS = Array.from({ length: 30 }, (_, i) => i % 10)
  // A drum rests on the middle round of digits, so it can turn up to a full round either way
  const REST = 10

  /** The final value, as text. */
  let text = $state(untrack(() => String(value)))
  /** While rolling: the static prefix ("+") and a drum per digit. */
  let wheels = $state<{ prefix: string; drums: Drum[] } | null>(null)
  let tone = $state<Tone | null>(null)
  let root: HTMLSpanElement | undefined = $state()
  let lift: HTMLSpanElement | undefined = $state()
  let shake: HTMLSpanElement | undefined = $state()

  let last = untrack(() => ({ value: String(value), reset, bust, progress }))
  let gen = 0
  let destroyed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    const next = { value: String(value), reset, bust, progress }
    untrack(() => {
      void change(next)
    })
  })
  onDestroy(() => {
    destroyed = true
    clearTimeout(timer)
  })

  /** Stop whatever is rolling: the number snaps to its target. */
  function stop() {
    clearTimeout(timer)
    for (const a of root?.getAnimations({ subtree: true }) ?? []) a.cancel()
    wheels = null
  }

  /** Clear the colour after `ms`, unless another change came first. */
  function fade(my: number, ms: number) {
    timer = setTimeout(() => {
      if (gen === my) tone = null
    }, ms)
  }

  async function change(next: typeof last) {
    const plan = planChange({
      from: last.value,
      to: next.value,
      normal,
      reset: next.reset !== last.reset,
      bust: next.bust,
      wasBust: last.bust,
      progress: next.progress,
      prevProgress: last.progress,
      reducedMotion: reducedMotion(),
    })
    const from = last.value
    last = next
    if (plan.kind === 'none') return
    const my = ++gen
    stop()
    text = next.value
    tone = plan.tone === 'plain' ? null : plan.tone

    const a = parseRolling(from)
    const z = parseRolling(next.value)
    // A jump (reduced motion keeps the colour of the change)
    if (plan.kind === 'jump' || !a || !z) {
      if (tone) fade(my, plan.tone === 'bust' ? BUST_HOLD : ROLL)
      return
    }

    const drums = planDrums(a.digits, z.digits, plan.dir)
    const moves = drums.some(d => d.steps !== 0)
    if (moves) wheels = { prefix: z.prefix, drums }
    await tick()
    if (destroyed || gen !== my || !root) return

    const delay = plan.tone === 'bust' ? SHAKE : 0
    for (const d of moves ? drums : []) {
      const wheel = root.querySelector<HTMLElement>(`[data-place="${d.place}"]`)
      const strip = wheel?.querySelector<HTMLElement>('[data-strip]')
      if (!wheel || !strip) continue
      if (d.steps) {
        strip.animate([{ transform: cell(REST + d.from) }, { transform: cell(REST + d.from + d.steps) }], {
          duration: ROLL,
          delay,
          easing: SETTLE,
          fill: 'backwards',
        })
      }
      if (d.enter || d.leave) {
        // The digit's own width (layout pixels, unaffected by any scale on the way up)
        const w = `${wheel.querySelector<HTMLElement>('[data-size]')?.offsetWidth ?? 0}px`
        const shut = { width: '0px', opacity: 0 }
        const open = { width: w, opacity: 1 }
        wheel.animate(d.enter ? [shut, open] : [open, shut], { duration: ROLL, delay, easing: 'ease-out', fill: 'backwards' })
      }
    }
    if (plan.tone === 'bust') {
      shake?.animate(
        [0, -0.067, 0.06, -0.047, 0.033, 0].map(x => ({ transform: `translateX(${x}em)` })),
        { duration: SHAKE, easing: 'linear' },
      )
    } else {
      const y = plan.dir === 'down' ? 6 : -6
      lift?.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${y}px)`, offset: 0.2 }, { transform: 'translateY(0)' }], {
        duration: ROLL + 50,
        easing: 'ease-out',
      })
    }

    timer = setTimeout(() => {
      if (gen !== my) return
      wheels = null
      if (plan.tone !== 'bust') tone = null
      else fade(my, BUST_HOLD - ROLL - delay)
    }, ROLL + delay)
  }

  const cell = (i: number) => `translateY(${-i * 100}%)`
  const color = $derived(tone === 'bust' ? 'text-live' : tone === 'back' ? 'text-warn' : checkout && !wheels ? 'text-accent' : '')
</script>

<span bind:this={root} class="inline-block whitespace-nowrap {color}"
  ><span bind:this={lift} class="inline-block"
    ><span bind:this={shake} class="inline-block">
      {#if wheels}<span class="sr-only">{text}</span><span aria-hidden="true"
          >{wheels.prefix}{#each wheels.drums as d (d.place)}<span
              data-place={d.place}
              class="relative inline-block"
              style:width={d.leave ? '0px' : null}
              style:opacity={d.leave ? 0 : null}
              ><span data-size class="invisible">{d.leave ? d.from : d.to}</span><span class="window"
                ><span data-strip class="strip" style:transform={cell(REST + d.to)}
                  >{#each CELLS as n, i (i)}<span class="cell">{n}</span>{/each}</span
                ></span
              ></span
            >{/each}</span
        >{:else}{text}{/if}
    </span></span
  ></span
>

<style>
  /* The drum's window is the number's own line box, a hair taller for the digits' round
     bottoms; its edges fade like a wheel turning out of sight. Everything outside it is cut,
     rolling layers too (clip-path and paint containment clip composited content). */
  .window {
    position: absolute;
    top: -0.04em;
    bottom: -0.06em;
    left: -0.05em;
    right: -0.05em;
    overflow: hidden;
    contain: paint;
    clip-path: inset(0);
    -webkit-mask-image: linear-gradient(transparent, #000 0.05em, #000 calc(100% - 0.05em), transparent);
    mask-image: linear-gradient(transparent, #000 0.05em, #000 calc(100% - 0.05em), transparent);
  }
  .strip {
    display: block;
    height: 100%;
  }
  /* One cell per digit, a window tall: the digit sits on the same baseline as the number's text */
  .cell {
    display: block;
    height: 100%;
    box-sizing: border-box;
    padding-top: 0.04em;
    padding-left: 0.05em;
    text-align: left;
  }
</style>
