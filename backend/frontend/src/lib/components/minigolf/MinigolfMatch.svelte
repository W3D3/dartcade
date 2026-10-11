<!--
  The minigolf match screen (Minigolf.dc.html, Minigolf-Shot.dc.html): players in turn order, the
  hole, and the hole card with the dartboard to aim on, the try slots and Undo / Next. A new try
  rolls once no newer dart has landed for the shot delay.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { MinigolfGame, Segment } from '$lib/api'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import ScorecardOverlay from '$lib/components/minigolf/ScorecardOverlay.svelte'
  import { holeJustFinished } from '$lib/minigolf/scorecard'
  import { playFrames } from '$lib/minigolf/animate'
  import { otherBalls, ownBall, pathSig, rollFor, rows, toHole, trySlots } from '$lib/minigolf/match'
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
  } = $props()

  const playerRows = $derived(rows(game, players))
  const slots = $derived(trySlots(game))
  const roll = $derived(rollFor(game))
  const current = $derived(game.balls[game.currentPlayer])

  // Where the balls are drawn: at rest from the snapshot, or along the roll while it plays
  let frame = $state<number | null>(null)
  let rolled = ''
  // Only a new roll restarts the animation: other snapshot changes must not cancel one in play
  const rollKey = $derived(roll?.key ?? null)
  $effect(() => {
    if (rollKey === null) {
      frame = null
      return
    }
    const r = untrack(() => roll)
    if (!r) return
    // A kept stroke that already rolled as its last try stays put
    if (r.kept && pathSig(r.own) === rolled) {
      frame = null
      return
    }
    rolled = pathSig(r.own)
    // The ball waits on its spot until no newer dart lands for the shot delay
    frame = 0
    const frames = Math.max(r.own.length, ...r.others.map(o => o.path.length))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let stop = () => {}
    const timer = setTimeout(() => {
      stop = playFrames(frames, i => (frame = i), reduced)
    }, r.delayMs)
    return () => {
      clearTimeout(timer)
      stop()
    }
  })

  // The scorecard between holes: opens when the game moves on to a new hole, closes on its own,
  // or as soon as the new hole's first dart lands
  let prevHole: number | null = null
  let scorecard = $state(false)
  $effect(() => {
    const h = game.holeIdx
    if (holeJustFinished(prevHole, h)) scorecard = true
    prevHole = h
  })
  $effect(() => {
    if (game.tries.length > 0 || game.finished) scorecard = false
  })

  const at = (path: Pt[], i: number): Pt => path[Math.min(i, path.length - 1)]
  /** A seat's ball while the roll plays; undefined when the roll doesn't move it. */
  function rolling(seat: number): Pt | undefined {
    if (!roll || frame === null) return undefined
    if (seat === roll.seat) return at(roll.own, frame)
    const moved = roll.others.find(m => m.seat === seat)
    return moved && at(moved.path, frame)
  }
  const ball = $derived(rolling(game.currentPlayer) ?? ownBall(game))
  const others = $derived.by(() => {
    const resting = otherBalls(game, players).map(o => ({ ...o, at: rolling(o.seat) ?? o.at }))
    // The ball of a kept stroke rolls on even though the next player is up (and it may be in the cup by now)
    const seat = roll?.seat
    if (seat === undefined || seat === game.currentPlayer || resting.some(o => o.seat === seat)) return resting
    const at_ = rolling(seat)
    const label = (players[seat]?.name ?? '?').slice(0, 1).toUpperCase()
    return at_ && frame !== null && frame < (roll?.own.length ?? 0) - 1 ? [...resting, { seat, at: at_, label }] : resting
  })
</script>

<main
  class="flex-grow min-h-0 overflow-y-auto lg:overflow-hidden box-border p-4 lg:p-6 flex flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)_minmax(300px,400px)] gap-4 lg:gap-6"
>
  <!-- Players, in this hole's turn order -->
  <section aria-label="Players" class="flex flex-col gap-2 lg:overflow-y-auto">
    {#each playerRows as r (r.seat)}
      <div
        class="flex items-center gap-3 rounded-[14px] border px-4 py-3 {r.active
          ? 'border-accent bg-accent-tint'
          : 'border-line bg-surface-1'}"
        data-testid="minigolf-player"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-[17px] font-semibold">{r.name}</span>
          <span class="text-[13px] {r.active ? 'text-accent' : 'text-text-muted'}">{r.status}</span>
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
    <HoleView hole={toHole(game.hole)} {ball} {others} />
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
  <ScorecardOverlay {game} {players} onclose={() => (scorecard = false)} />
{/if}
