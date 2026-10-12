<!--
  The minigolf match screen (Minigolf.dc.html, Minigolf-Shot.dc.html): players in turn order, the
  hole, and the hole card with the dartboard to aim on, the try slots and Undo / Next. A new try
  rolls once no newer dart has landed for the shot delay.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { Tween } from 'svelte/motion'
  import type { MinigolfGame, Segment } from '$lib/api'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import ScorecardOverlay from '$lib/components/minigolf/ScorecardOverlay.svelte'
  import { seatColor } from '$lib/details/chartColors'
  import { holeJustFinished } from '$lib/minigolf/scorecard'
  import { playFrames } from '$lib/minigolf/animate'
  import type { GameSettings } from '$lib/gameSettings'
  import { createSounds } from '$lib/sounds'
  import { PLAYBACK, otherBalls, pathSig, previewLines, rollFor, rollRate, rows, toHole, trySlots } from '$lib/minigolf/match'
  import type { Pt } from '$shared/minigolf/types'

  let {
    game,
    players,
    darts,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    rolling: busy = $bindable(false),
    settings,
  }: {
    game: MinigolfGame
    players: { name: string }[]
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
    canThrow: boolean
    locked: boolean
    canUndo: boolean
    next: { label: string; prominent: boolean; enabled: boolean }
    onUndo: () => void
    onNext: () => void
    onBoardClick: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** A stroke is still rolling: the match screen holds the turn (and the win screen) until it's done. */
    rolling?: boolean
    /** The viewer's display and sound settings (direction wheel, slow motion, sounds). */
    settings: GameSettings
  } = $props()

  const slots = $derived(trySlots(game))
  const roll = $derived(rollFor(game))

  // Where the balls are drawn: at rest from the snapshot, or along the roll while it plays
  let frame = $state<number | null>(null)
  let rolled = ''
  // Only a new roll restarts the animation: other snapshot changes must not cancel one in play
  const rollKey = $derived(roll?.key ?? null)
  const zoom = new Tween(0, { duration: 450, easing: cubicOut })
  const sounds = createSounds(() => settings.volume)
  /** The last samples of a dropped ball's path: it sinking into the cup. */
  const SINKING = 8
  let playing = $state(false)
  // Opening the page (or a reload) shows the game at rest: a stroke rolled before isn't rolled again
  const openedOn = untrack(() => rollKey)
  $effect.pre(() => {
    if (rollKey === null || rollKey === openedOn) {
      frame = null
      return
    }
    const current = untrack(() => roll)
    if (!current) return
    const r = current
    // A kept stroke that already rolled as its last try stays put
    if (r.kept && pathSig(r.own) === rolled) {
      frame = null
      return
    }
    rolled = pathSig(r.own)
    frame = 0
    const frames = Math.max(r.own.length, ...r.others.map(o => o.path.length))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cup = untrack(() => game.hole.cup.at)
    let zoomOut: ReturnType<typeof setTimeout> | undefined
    // Zoom in on the ball while it rolls, slow motion near the cup, zoom back out once it's done
    playing = true
    let stop = () => {}
    let cancelled = false
    let knocks = 0
    let dropped = false
    const play = () => {
      if (cancelled) return
      stop = playFrames(frames, onFrame, reduced, {
        rate: i => (settings.slowMotion ? rollRate(at(r.own, i), cup) : PLAYBACK),
        onDone: () => {
          playing = false
          zoomOut = setTimeout(() => void zoom.set(0), 700)
        },
      })
    }
    function onFrame(i: number): void {
      frame = i
      // The ball's sounds: a knock as it reaches each contact, a plop as it starts to sink
      for (; knocks < r.hits.length && i >= r.hits[knocks]; knocks++) if (settings.soundBall) sounds.knock()
      if (r.holed && !dropped && i >= r.own.length - SINKING) {
        dropped = true
        if (settings.soundBall) sounds.cup()
      }
    }
    // The camera settles on the ball before it starts to roll
    if (reduced) play()
    else void zoom.set(1).then(play)
    return () => {
      cancelled = true
      clearTimeout(zoomOut)
      stop()
      playing = false
      void zoom.set(0, { duration: 0 })
    }
  })

  // The scorecard between holes: opens when the game moves on to a new hole, closes on its own,
  // or as soon as the new hole's first dart lands
  // (after the hole's last stroke has rolled)
  let prevHole: number | null = null
  let scorecardDue = $state(false)
  $effect(() => {
    const h = game.holeIdx
    if (holeJustFinished(prevHole, h)) scorecardDue = true
    prevHole = h
  })
  $effect(() => {
    if (game.tries.length > 0 || game.finished) scorecardDue = false
  })
  const scorecard = $derived(scorecardDue && !playing)

  // A dart lands: hit, or a miss off the board
  let triesHeard = untrack(() => game.tries.length)
  $effect(() => {
    const n = game.tries.length
    const last = game.tries.at(-1)
    if (n > triesHeard && last) {
      if (last.missed && settings.soundMiss) sounds.miss()
      if (!last.missed && settings.soundHit) sounds.hit()
    }
    triesHeard = n
  })
  $effect(() => {
    busy = playing
  })

  /** The point at fractional frame `i` of a path: between two samples it glides, so slow motion stays smooth. */
  function at(path: Pt[], i: number): Pt {
    const k = Math.min(Math.floor(i), path.length - 1)
    const a = path[k]
    const b = path[Math.min(k + 1, path.length - 1)]
    const t = Math.min(1, i - k)
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  /** A seat's ball while the roll plays; undefined when the roll doesn't move it. */
  function rolling(seat: number): Pt | undefined {
    if (!roll || frame === null) return undefined
    if (seat === roll.seat) return at(roll.own, frame)
    const moved = roll.others.find(m => m.seat === seat)
    return moved && at(moved.path, frame)
  }
  const initial = (seat: number) => (players[seat]?.name ?? '?').slice(0, 1).toUpperCase()
  const pt = (p: number[]): Pt => [p[0] ?? 0, p[1] ?? 0]
  // While a stroke rolls, its player stays up: the snapshot has moved on to the next one already
  const up = $derived(playing && roll ? roll.seat : game.currentPlayer)
  // The stroke that ended a hole rolls on that hole, before the scorecard
  const pastHole = $derived(playing && roll && roll.hole !== game.holeIdx ? game.lastHole : null)
  const shownHole = $derived(toHole(pastHole?.hole ?? game.hole))
  const playerRows = $derived(rows(game, players, up))
  const ball = $derived(rolling(up) ?? pt(game.balls[up]?.at ?? game.hole.tee))
  const others = $derived(
    pastHole
      ? (roll?.others ?? []).map(o => ({
          seat: o.seat,
          at: rolling(o.seat) ?? at(o.path, 0),
          label: initial(o.seat),
          color: seatColor(o.seat),
        }))
      : otherBalls(game, players, up).map(o => ({ ...o, at: rolling(o.seat) ?? o.at, color: seatColor(o.seat) })),
  )
  const current = $derived(game.balls[up])
  // The next player is up once the stroke has rolled
  let upHeard = untrack(() => up)
  $effect(() => {
    if (up !== upHeard && settings.soundSwitch) sounds.switchPlayer()
    upHeard = up
  })
  // The dial only while the putter can still aim: nothing rolling, tries left, the ball still in play
  const aiming = $derived(!playing && !game.finished && !game.visitLocked && (current.status === 'waiting' || current.status === 'playing'))
</script>

<main
  class="flex-grow min-h-0 overflow-y-auto lg:overflow-hidden box-border p-4 lg:p-6 flex flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)_minmax(300px,400px)] gap-4 lg:gap-6"
>
  <!-- Players, in this hole's turn order -->
  <section aria-label="Players" class="flex flex-col gap-2 lg:overflow-y-auto">
    {#each playerRows as r (r.seat)}
      <div
        class="flex items-center gap-3 rounded-[14px] border px-4 py-3 {r.active ? '' : 'border-line bg-surface-1'}"
        style:border-color={r.active ? seatColor(r.seat) : undefined}
        style:background={r.active ? `color-mix(in srgb, ${seatColor(r.seat)} 14%, transparent)` : undefined}
        data-testid="minigolf-player"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-[17px] font-semibold">{r.name}</span>
          <span class="text-[13px] {r.active ? '' : 'text-text-muted'}" style:color={r.active ? seatColor(r.seat) : undefined}
            >{r.status}</span
          >
        </div>
        <div class="ml-auto flex items-baseline gap-3 text-right">
          <span class="flex flex-col">
            <strong class="font-display text-[28px] leading-none" data-testid="hole-strokes">{r.strokes}</strong>
            <span class="text-[11px] uppercase tracking-[0.08em] text-text-muted">Strokes</span>
          </span>
          <span class="flex flex-col">
            <strong class="font-display text-[20px] leading-none">{r.total}</strong>
            <span class="text-[11px] uppercase tracking-[0.08em] text-text-muted">{r.toPar}</span>
          </span>
        </div>
      </div>
    {/each}
  </section>

  <!-- The hole -->
  <section aria-label="Hole" class="min-h-[45vh] lg:min-h-0 rounded-2xl bg-bg-deep overflow-hidden">
    <HoleView
      hole={shownHole}
      {ball}
      ballColor={seatColor(up)}
      {others}
      previews={previewLines(game)}
      aim={aiming && settings.aimDial ? { at: ball, ...game.reach } : null}
      halo={!playing}
      camera={roll && zoom.current > 0 ? { focus: rolling(roll.seat) ?? ball, t: zoom.current } : null}
    />
  </section>

  <!-- The hole card, the board to aim on, the tries -->
  <section aria-label="Your shot" class="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
    <div class="flex items-baseline justify-between rounded-[14px] bg-surface-1 px-4 py-3">
      <span class="flex flex-col">
        <span class="text-[12px] uppercase tracking-[0.12em] text-text-muted">Hole {game.holeIdx + 1} of {game.holeCount}</span>
        <span class="font-display text-[26px] font-bold uppercase leading-tight">{game.hole.name}</span>
      </span>
      <span class="font-display text-[26px] font-bold">Par {game.hole.par}</span>
    </div>
    <div class="mx-auto w-full max-w-[380px]">
      <DartBoard {darts} onBoardClick={canThrow && !locked ? onBoardClick : undefined} />
    </div>
    <p class="m-0 text-center text-[13px] text-text-muted">
      Angle from the bull = direction · Distance from the bull = power · Bull putts at the cup
    </p>
    <div class="grid gap-2" style:grid-template-columns="repeat({slots.length}, minmax(0, 1fr))" aria-label="Tries">
      {#each slots as slot, i (i)}
        <div
          class="flex flex-col rounded-[10px] border px-3 py-2 {slot.state === 'kept'
            ? 'border-accent text-text'
            : slot.state === 'replaced'
              ? 'border-line text-text-muted line-through decoration-1'
              : 'border-dashed border-line-dashed text-text-muted'}"
        >
          <strong class="font-display text-[20px] leading-tight">{slot.label || '·'}</strong>
          <span class="text-[12px] no-underline">{slot.note}</span>
        </div>
      {/each}
    </div>
    <div class="flex items-center justify-between text-[14px] text-text-muted">
      <span>This hole</span>
      <span><strong class="text-text">{current.strokes}</strong> / max {game.config.maxStrokes}</span>
    </div>
    <ControlBar {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
  </section>
</main>

{#if scorecard}
  <ScorecardOverlay {game} {players} onclose={() => (scorecardDue = false)} />
{/if}
