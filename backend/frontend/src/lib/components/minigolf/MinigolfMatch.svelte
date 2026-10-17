<!--
  The minigolf match screen (Minigolf.dc.html, Minigolf-Shot.dc.html): players in turn order, the
  hole (in 3D where WebGL works, else flat), and the hole card with the
  dartboard to aim on, the try slots and Undo / Next. A new try rolls once no newer dart has
  landed for the shot delay.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { ChevronDown, ChevronUp } from '@lucide/svelte'
  import { cubicOut } from 'svelte/easing'
  import { Tween } from 'svelte/motion'
  import type { MinigolfGame, Segment } from '$lib/api'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import ScorecardOverlay from '$lib/components/minigolf/ScorecardOverlay.svelte'
  import { seatColor } from '$lib/details/chartColors'
  import { playFrames } from '$lib/minigolf/animate'
  import type { GameSettings } from '$lib/gameSettings'
  import { createSounds } from '$lib/sounds'
  import {
    PLAYBACK,
    ROLL_DELAY_MS,
    aimLines,
    otherBalls,
    ownBall,
    restingAt,
    ORBIT_MS,
    endsHole,
    rollCup,
    shotPanelOpen,
    rollFor,
    rollRate,
    rows,
    toHole,
    trySlots,
  } from '$lib/minigolf/match'
  import type { Hole, PathPt, Pt } from '$shared/minigolf/types'
  import { webglAvailable } from '$lib/webgl'

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
    host,
    manual,
    onNextHole,
    onrolled,
    settings,
  }: {
    game: MinigolfGame
    players: { name: string }[]
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
    canThrow: boolean
    locked: boolean
    canUndo: boolean
    next: { prominent: boolean; enabled: boolean }
    onUndo: () => void
    onNext: () => void
    onBoardClick: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    /** The viewer is the host: they start the next hole (the game waits between holes). */
    host: boolean
    /** Darts come in by hand (no board scores): the shot panel with the board starts open. */
    manual: boolean
    onNextHole: () => void
    /** A roll (its key from rollFor) is done, or there was nothing to roll: the page holds the win
     *  screen until the game's last stroke has rolled. */
    onrolled?: (key: string) => void
    /** The viewer's display and sound settings (direction wheel, slow motion, sounds). */
    settings: GameSettings
  } = $props()

  // 3D where the device can draw it; else the flat view
  const webgl = webglAvailable()
  let failed = $state(false)
  const view3d = $derived(webgl && !failed)
  // A stale chunk after a deploy or a flaky network: play on in the flat view
  const loadHole3D = () =>
    import('$lib/components/minigolf/Hole3D.svelte').catch((e: unknown) => {
      failed = true
      throw e
    })

  const slots = $derived(trySlots(game))
  const roll = $derived(rollFor(game))

  // Where the balls are drawn: at rest from the snapshot, or along the roll while it plays
  let frame = $state<number | null>(null)
  // Only a new roll restarts the animation: other snapshot changes must not cancel one in play
  const rollKey = $derived(roll?.key ?? null)
  const zoom = new Tween(0, { duration: 450, easing: cubicOut })
  const sounds = createSounds(() => settings.volume)
  /** The last samples of a dropped ball's path: it sinking into the cup. */
  const SINKING = 8
  let playing = $state(false)
  /** The hole just played out: the camera circles its cup before the scorecard (or the win screen). */
  let orbiting = $state<Pt | null>(null)
  // Opening the page (or a reload) shows the game at rest: a stroke rolled before isn't rolled again
  const openedOn = untrack(() => rollKey)
  $effect.pre(() => {
    const current = rollKey === null ? null : untrack(() => roll)
    if (!current || current.key === openedOn) {
      frame = null
      if (current) onrolled?.(current.key)
      return
    }
    const r = current
    frame = 0
    const frames = Math.max(r.own.length, ...r.others.map(o => o.path.length))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cup = untrack(() => rollCup(game, r))
    let zoomOut: ReturnType<typeof setTimeout> | undefined
    let orbitEnd: ReturnType<typeof setTimeout> | undefined
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
          const done = () => {
            // From now on the snapshot places the balls (after a hole's last stroke: on the next tee)
            orbiting = null
            frame = null
            playing = false
            onrolled?.(r.key)
            zoomOut = setTimeout(() => void zoom.set(0), 700)
          }
          // A played-out hole: a few seconds round its cup first
          const ended = untrack(() => endsHole(game, r))
          if (!ended || reduced) return done()
          orbiting = untrack(() => pt(rollCup(game, r)))
          orbitEnd = setTimeout(done, ORBIT_MS)
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
    // A pause for the suspense, then the camera settles on the ball before it starts to roll
    const pause = setTimeout(() => {
      // The 3D chase camera glides onto the ball by itself
      if (reduced || untrack(() => view3d)) play()
      else void zoom.set(1).then(play)
    }, ROLL_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(pause)
      clearTimeout(zoomOut)
      clearTimeout(orbitEnd)
      stop()
      orbiting = null
      playing = false
      void zoom.set(0, { duration: 0 })
    }
  })

  // The scorecard between holes: the game waits on it until the host starts the next hole
  const scorecard = $derived(game.paused && !playing)

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

  /** The point at fractional frame `i` of a path: between two samples it glides, so slow motion stays smooth. */
  function at(path: readonly PathPt[], i: number): PathPt {
    const k = Math.min(Math.floor(i), path.length - 1)
    const a = path[k]
    const b = path[Math.min(k + 1, path.length - 1)]
    const t = Math.min(1, i - k)
    const xy: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    return a[2] === undefined || b[2] === undefined ? xy : [...xy, a[2] + (b[2] - a[2]) * t]
  }
  /** A seat's ball while the roll plays; undefined when the roll doesn't move it. */
  function rolling(seat: number): PathPt | undefined {
    if (!roll || frame === null) return undefined
    if (seat === roll.seat) return at(roll.own, frame)
    const moved = roll.others.find(m => m.seat === seat)
    return moved && at(moved.path, frame)
  }
  const initial = (seat: number) => (players[seat]?.name ?? '?').slice(0, 1).toUpperCase()
  const pt = (p: readonly (number | undefined)[]): Pt => [p[0] ?? 0, p[1] ?? 0]
  // While a stroke rolls, its player stays up: the snapshot has moved on to the next one already
  const up = $derived(playing && roll ? roll.seat : game.currentPlayer)
  // The stroke that ended a hole rolls on that hole, before the scorecard
  const pastHole = $derived(playing && roll && roll.hole !== game.holeIdx ? game.lastHole : null)
  // The same object for the same hole: a new one (every snapshot) would rebuild the 3D course on every dart
  let holeMemo: { key: string; hole: Hole } | null = null
  const shownHole = $derived.by(() => {
    const key = pastHole ? `past:${pastHole.index}` : `${game.holeIdx}`
    if (holeMemo?.key !== key) holeMemo = { key, hole: toHole(pastHole?.hole ?? game.hole) }
    return holeMemo.hole
  })
  const playerRows = $derived(rows(game, players, up))
  const ball = $derived(rolling(up) ?? restingAt(game, up, shownHole))
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
  // The dial while the putter aims, until the stroke is kept: nothing rolling, the ball still in play
  const aiming = $derived(!playing && !game.finished && (current.status === 'waiting' || current.status === 'playing'))
  const aim = $derived(aiming && settings.aimDial ? { at: pt(ball), ...game.reach } : null)

  // The game fills the screen; the players and the shot panel float over it. The shot panel docks
  // (tries and controls only) for board play; the choice is remembered on this device.
  const PANEL_KEY = 'dartcade.minigolf.shotPanel'
  const savedPanel = (): string | null => {
    try {
      return localStorage.getItem(PANEL_KEY)
    } catch {
      return null
    }
  }
  let panelOpen = $state(
    shotPanelOpen(
      typeof localStorage === 'undefined' ? null : savedPanel(),
      untrack(() => manual),
    ),
  )
  function togglePanel(): void {
    panelOpen = !panelOpen
    try {
      localStorage.setItem(PANEL_KEY, panelOpen ? 'open' : 'closed')
    } catch {
      // Not remembered then (a private window): still toggles
    }
  }
  // Side panels from lg up; a top strip and a bottom sheet below
  const wide = new MediaQuery('min-width: 1024px')
  let playersW = $state(0)
  let playersH = $state(0)
  let shotW = $state(0)
  let shotH = $state(0)
  /** What the panels cover of the hole's canvas: the hole is framed in the rest. */
  const insets = $derived(
    wide.current
      ? // Docked, the shot sits in a corner: the hole keeps the whole width and height
        { left: playersW + 16, right: panelOpen ? shotW + 16 : 0, top: 0, bottom: 0 }
      : { left: 0, right: 0, top: playersH + 12, bottom: shotH },
  )
</script>

{#snippet tries(compact: boolean)}
  <div class="grid gap-2" style:grid-template-columns="repeat({slots.length}, minmax(0, 1fr))" aria-label="Tries">
    {#each slots as slot, i (i)}
      <div
        class="flex flex-col rounded-[10px] border {compact ? 'px-2 py-1' : 'px-3 py-2'} {slot.state === 'kept'
          ? 'border-accent text-text'
          : slot.state === 'replaced'
            ? 'border-line text-text-muted line-through decoration-1'
            : 'border-dashed border-line-dashed text-text-muted'}"
      >
        <strong class="font-display {compact ? 'text-[16px]' : 'text-[20px]'} leading-tight">{slot.label || '·'}</strong>
        {#if !compact}<span class="text-[12px] no-underline">{slot.note}</span>{/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet controls()}
  <!-- With darts in: Shoot keeps the last try and rolls it; the next player comes up after the roll.
       Without: the stroke counts as a miss (one stroke more, the ball stays) -->
  <ControlBar
    canUndo={canUndo && !playing}
    label={darts.length > 0 ? 'Shoot' : 'Skip stroke'}
    prominent={next.prominent}
    primary={darts.length > 0}
    enabled={next.enabled && !playing}
    {onUndo}
    {onNext}
  />
{/snippet}

<main class="relative flex-grow min-h-0 overflow-hidden">
  <!-- The hole: the whole stage, the panels float over it -->
  <section aria-label="Hole" class="absolute inset-0 bg-bg-deep" data-view={view3d ? '3d' : '2d'}>
    {#if view3d}
      <div class="absolute inset-0">
        {#await loadHole3D() then { default: Hole3D }}
          <Hole3D
            hole={shownHole}
            {ball}
            ballColor={seatColor(up)}
            {others}
            aims={aimLines(game, ownBall(game))}
            {aim}
            {insets}
            follow={playing && !orbiting && roll && frame !== null ? { path: roll.own, at: frame } : null}
            orbit={orbiting}
            onfail={() => (failed = true)}
          />
        {/await}
      </div>
    {:else}
      <div class="absolute inset-0 box-border" style:padding="{insets.top}px {insets.right}px {insets.bottom}px {insets.left}px">
        <HoleView
          hole={shownHole}
          ball={pt(ball)}
          ballColor={seatColor(up)}
          others={others.map(o => ({ ...o, at: pt(o.at) }))}
          aims={aimLines(game, ownBall(game))}
          {aim}
          halo={!playing}
          camera={roll && zoom.current > 0 ? { focus: pt(rolling(roll.seat) ?? ball), t: zoom.current } : null}
        />
      </div>
      <p class="absolute left-1/2 -translate-x-1/2 bottom-3 m-0 rounded-full bg-surface-1/90 px-3 py-1 text-[12px] text-text-muted">
        3D isn't available on this device; showing the flat view
      </p>
    {/if}
  </section>

  <!-- Players, in this hole's turn order: a column on the left, a strip along the top on small screens -->
  <section
    aria-label="Players"
    bind:offsetWidth={playersW}
    bind:offsetHeight={playersH}
    class="absolute left-3 right-3 top-3 z-10 flex gap-2 overflow-x-auto lg:right-auto lg:left-4 lg:top-4 lg:w-[250px] lg:max-h-[calc(100%-32px)] lg:flex-col lg:overflow-y-auto"
  >
    {#each playerRows as r (r.seat)}
      <div
        class="flex shrink-0 items-center gap-3 rounded-[14px] border px-3 py-2 backdrop-blur-md lg:px-4 lg:py-3 {r.active
          ? ''
          : 'border-line bg-surface-1/75'}"
        style:border-color={r.active ? seatColor(r.seat) : undefined}
        style:background={r.active ? `color-mix(in srgb, ${seatColor(r.seat)} 22%, rgb(20 21 19 / 0.8))` : undefined}
        data-testid="minigolf-player"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-[15px] font-semibold lg:text-[17px]">{r.name}</span>
          <span
            class="text-[12px] lg:text-[13px] {r.active ? '' : 'text-text-muted'}"
            style:color={r.active ? seatColor(r.seat) : undefined}>{r.status}</span
          >
        </div>
        <div class="ml-auto flex items-baseline gap-3 text-right">
          <span class="flex flex-col">
            <strong class="font-display text-[22px] leading-none lg:text-[28px]" data-testid="hole-strokes">{r.strokes}</strong>
            <span class="text-[10px] uppercase tracking-[0.08em] text-text-muted lg:text-[11px]">Strokes</span>
          </span>
          <span class="hidden flex-col lg:flex">
            <strong class="font-display text-[20px] leading-none">{r.total}</strong>
            <span class="text-[11px] uppercase tracking-[0.08em] text-text-muted">{r.toPar}</span>
          </span>
        </div>
      </div>
    {/each}
  </section>

  <!-- The shot: the hole card, the board to aim on, the tries and the controls. Docked to the tries
       and the controls for board play; a bottom sheet on small screens -->
  <section
    aria-label="Your shot"
    bind:offsetWidth={shotW}
    bind:offsetHeight={shotH}
    class="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface-1/85 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-md lg:inset-x-auto lg:right-4 lg:w-[360px] lg:rounded-2xl lg:p-4 {panelOpen
      ? 'max-h-[62%] lg:top-4 lg:bottom-4 lg:max-h-none'
      : 'lg:bottom-4'}"
  >
    <div class="flex items-center gap-3">
      <span class="flex min-w-0 flex-col">
        <span class="text-[11px] uppercase tracking-[0.12em] text-text-muted">Hole {game.holeIdx + 1} of {game.holeCount}</span>
        <span class="truncate font-display text-[20px] font-bold uppercase leading-tight lg:text-[24px]">{game.hole.name}</span>
      </span>
      <span class="ml-auto font-display text-[20px] font-bold lg:text-[24px]">Par {game.hole.par}</span>
      <button
        type="button"
        class="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line-2 bg-surface-2 text-text cursor-pointer hover:bg-surface-hover"
        aria-expanded={panelOpen}
        aria-label={panelOpen ? 'Hide the shot panel' : 'Show the shot panel'}
        title={panelOpen ? 'Hide the shot panel' : 'Show the shot panel'}
        onclick={togglePanel}
      >
        {#if panelOpen}<ChevronDown size={18} class="lg:-rotate-90" />{:else}<ChevronUp size={18} class="lg:rotate-90" />{/if}
      </button>
    </div>
    {#if panelOpen}
      <div class="mx-auto w-full max-w-[min(340px,30vh)] lg:max-w-[340px]">
        <DartBoard {darts} onBoardClick={canThrow && !locked ? onBoardClick : undefined} />
      </div>
      <p class="m-0 hidden text-center text-[12px] text-text-muted lg:block">
        Angle from the bull = direction · Distance from the bull = power · Bull putts at the cup
      </p>
      {@render tries(false)}
      <div class="hidden items-center justify-between text-[14px] text-text-muted lg:flex">
        <span>This hole</span>
        <span><strong class="text-text">{current.strokes}</strong> / max {game.config.maxStrokes}</span>
      </div>
    {:else}
      {@render tries(true)}
    {/if}
    {@render controls()}
  </section>
</main>

{#if scorecard}
  <ScorecardOverlay {game} {players} {host} onnext={onNextHole} />
{/if}
