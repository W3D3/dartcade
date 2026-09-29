<script lang="ts">
  // Bull off for any game wrapped with withBullOff: one dart each, closest to
  // the centre throws first. Driven entirely by the snapshot's `bullOff` view.
  import DartBoard from './DartBoard.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Throw = { mm: number | null; segment: string; thetaDeg: number | null; estimated: boolean }
  type Result = { order: number[]; rethrow: boolean; reason?: 'tie' | 'bullseye' | 'all_missed' }
  export type BullOffView = {
    throws: (Throw | null)[]
    sequence: number[]
    currentPlayer: number
    result: Result | null
  }
  type Segment = { name: string; number: number; bed: string; multiplier: number }

  let { players, bullOff, manual, send }: {
    players: { name: string }[]
    bullOff: BullOffView
    /** No board attached: darts are entered by clicking the board. */
    manual: boolean
    send: (action: Record<string, unknown>) => void
  } = $props()

  const BOARD_MM = 170            // r = 1 in board units
  const FULL_VIEW_MM = 1.15 * BOARD_MM
  const BULLSEYE_MM = 6.35
  const OUTER_BULL_MM = 15.9

  const result = $derived(bullOff.result)
  const current = $derived(bullOff.currentPlayer)
  const currentThrow = $derived(bullOff.throws[current] ?? null)
  const name = (i: number) => players[i]?.name ?? `Player ${i + 1}`
  const initial = (i: number) => name(i).trim()[0]?.toUpperCase() ?? '?'

  // Rows: this round's throwing order, or the ranking once decided
  const rows = $derived(result && !result.rethrow ? result.order : bullOff.sequence)

  // Closest dart so far — the one to beat
  const best = $derived.by(() => {
    let b: { mm: number; player: number } | null = null
    bullOff.throws.forEach((t, i) => {
      if (t?.mm != null && (!b || t.mm < b.mm)) b = { mm: t.mm, player: i }
    })
    return b as { mm: number; player: number } | null
  })

  // Show the whole board until a dart lands, then zoom in to fit every dart
  const viewMm = $derived.by(() => {
    const hits = bullOff.throws.flatMap(t => t?.mm != null ? [t.mm] : [])
    if (!hits.length) return FULL_VIEW_MM
    return Math.min(FULL_VIEW_MM, Math.max(35, Math.max(...hits) * 1.3))
  })
  const zoom = $derived(FULL_VIEW_MM / viewMm)
  const rings = $derived(zoom > 1.5 ? Array.from({ length: Math.floor(viewMm / 10) }, (_, i) => (i + 1) * 10) : [])

  function markerPos(t: Throw, player: number) {
    // Darts without a camera angle (entered by hand) get a fixed spot per player
    const deg = t.thetaDeg ?? 90 + player * 67
    const r = (t.mm ?? 0) / BOARD_MM
    return { x: r * Math.cos(deg * Math.PI / 180), y: -r * Math.sin(deg * Math.PI / 180) }
  }

  const fmtMm = (t: Throw | null) =>
    !t ? '—' : t.mm === null ? 'Miss' : `${t.estimated ? '≈' : ''}${t.mm.toFixed(1)}`
  const bedLabel = (t: Throw) =>
    t.mm === null ? 'Off the board' : t.mm <= BULLSEYE_MM ? 'Bullseye' : t.mm <= OUTER_BULL_MM ? 'Outer bull' : t.segment
  const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`

  const RETHROW_REASON: Record<string, string> = {
    tie: 'The two closest darts are within 0.5 mm.',
    bullseye: 'More than one dart landed in the bullseye.',
    all_missed: 'Nobody hit the board.',
  }
  // The rethrow goes in reverse order
  const rethrowOrder = $derived([...bullOff.sequence].reverse())

  // Start automatically a few seconds after a clear result. Keyed on the
  // result's content so unrelated snapshot updates don't restart the timer.
  const resultKey = $derived(result ? JSON.stringify(result) : '')
  let countdown = $state<number | null>(null)
  $effect(() => {
    if (!resultKey || result?.rethrow) { countdown = null; return }
    countdown = 5
    const t = setInterval(() => {
      countdown = (countdown ?? 1) - 1
      if (countdown <= 0) { clearInterval(t); send({ type: 'bulloff_start' }) }
    }, 1000)
    return () => clearInterval(t)
  })

  function onSegmentClick(seg: Segment) {
    if (!currentThrow && !result) send({ type: 'add_dart', segment: seg })
  }
</script>

{#snippet marks(z: number)}
  <!-- 10 mm distance rings -->
  {#each rings as mm}
    <circle r={mm / BOARD_MM} fill="none" stroke="#efeee6" stroke-opacity="0.22"
      stroke-width={1.2 / z / 170} stroke-dasharray="{4 / z / 170} {4 / z / 170}" />
    <text x={(mm + 0.6) / BOARD_MM} y={-1 / z / 170} fill="#efeee6" fill-opacity="0.55"
      font-size={10 / z / 170} font-family="JetBrains Mono, monospace">{mm} mm</text>
  {/each}

  <!-- The ring to beat -->
  {#if best && !result}
    <circle r={best.mm / BOARD_MM} fill="#c6f24e" fill-opacity="0.10" stroke="#c6f24e"
      stroke-width={2 / z / 170} stroke-dasharray="{6 / z / 170} {4 / z / 170}" />
  {/if}

  <!-- Darts with their distance -->
  {#each bullOff.throws as t, i}
    {#if t && t.mm !== null}
      {@const p = markerPos(t, i)}
      {@const lead = best?.player === i}
      {@const color = lead ? '#c6f24e' : '#efeee6'}
      {@const left = p.x < 0}
      <line x1="0" y1="0" x2={p.x} y2={p.y} stroke={color} stroke-width={1.5 / z / 170} />
      <circle cx={p.x} cy={p.y} r={7 / z / 170} fill={color} stroke="#0f100e" stroke-width={2.5 / z / 170} />
      <text x={p.x + (left ? -12 : 12) / z / 170} y={p.y} dominant-baseline="central"
        text-anchor={left ? 'end' : 'start'} fill={color} font-size={13 / z / 170} font-weight="700"
        font-family="Instrument Sans, sans-serif" paint-order="stroke" stroke="#0f100e"
        stroke-width={4 / z / 170} stroke-linejoin="round">
        {initial(i)} · {fmtMm(t)} mm
      </text>
    {/if}
  {/each}
{/snippet}

<div class="flex-grow min-h-0 box-border p-[20px_24px] flex gap-6">

  <!-- Players -->
  <section class="flex-1 min-w-0 flex flex-col gap-3" aria-label="Bull off players">
    <div class="flex items-baseline justify-between">
      <h2 class="m-0 font-display font-bold text-[30px] uppercase leading-none">
        {result && !result.rethrow ? 'Result' : 'One dart each'}
      </h2>
      <span class="text-[14px] text-text-muted">Closest to the centre throws first</span>
    </div>

    {#each rows as p, pos (p)}
      {@const t = bullOff.throws[p]}
      {@const ranked = !!result && !result.rethrow}
      {@const throwing = !result && p === current}
      {@const highlight = throwing || (ranked && pos === 0)}
      <div class="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-4 box-border px-5 py-4 rounded-[14px]
                  {highlight ? 'bg-surface-active border-2 border-accent' : 'bg-surface-2 border border-line-2'}">
        {#if ranked}
          <span class="font-display font-bold text-[34px] leading-none {pos === 0 ? 'text-accent' : 'text-text-dim'}">{ordinal(pos + 1)}</span>
        {:else}
          <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[16px]
                       {throwing ? 'bg-accent text-accent-fg' : 'bg-line-3 text-text'}">{initial(p)}</span>
        {/if}

        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[19px] font-semibold truncate">{name(p)}</span>
          <span class="text-[13px] text-text-muted">
            {#if t}{bedLabel(t)}{:else if throwing}Throwing now{:else}Waiting{/if}
          </span>
        </div>

        <span class="flex items-baseline gap-1 font-display font-bold leading-none
                     {highlight && t?.mm != null ? 'text-accent' : t ? 'text-text' : 'text-line-3'}">
          <span class="text-[56px]">{fmtMm(t)}</span>
          {#if t?.mm != null}<span class="text-[20px] text-text-muted">mm</span>{/if}
        </span>

        {#if ranked}
          <span class="h-8 px-3 inline-flex items-center rounded-full text-[12px] font-bold tracking-[0.08em] uppercase
                       {pos === 0 ? 'bg-accent text-accent-fg' : 'border border-line-3 text-text-muted'}">
            Throws {ordinal(pos + 1)}
          </span>
        {:else}
          <span class="h-7 px-3 inline-flex items-center rounded-full text-[11px] font-bold tracking-[0.08em] uppercase
                       {throwing ? 'bg-accent text-accent-fg' : t ? 'border border-line-3 text-text-dim' : 'text-text-dim'}">
            {throwing ? 'Throwing' : t ? 'Thrown' : 'Up next'}
          </span>
        {/if}
      </div>
    {/each}

    <ul class="m-0 mt-auto pl-[18px] flex flex-col gap-1 text-[14px] leading-[1.45] text-text-muted">
      <li>Closest to the centre starts; everyone else follows by distance.</li>
      <li>Two in the bullseye, or the closest two within 0.5 mm: everyone throws again, in reverse order.</li>
      <li>A dart off the board counts as the farthest.</li>
    </ul>
  </section>

  <!-- Board + status -->
  <aside class="w-[min(46%,560px)] flex-shrink-0 flex flex-col gap-3" aria-label="Board">
    <div class="w-full mx-auto" style="max-width: min(100%, calc(100vh - 330px))">
      <DartBoard {zoom} overlay={marks}
        onSegmentClick={manual && !result && !currentThrow ? onSegmentClick : undefined} />
    </div>

    {#if result?.rethrow}
      <div role="status" class="flex flex-col gap-2 px-5 py-4 rounded-[14px] bg-surface-2 border border-line-2">
        <span class="font-display font-bold text-[28px] uppercase leading-none text-accent">Throw again</span>
        <span class="text-[15px] text-text">{RETHROW_REASON[result.reason ?? 'tie']}</span>
        <span class="text-[14px] text-text-muted">
          Reverse order: {rethrowOrder.map(name).join(', ')}
        </span>
      </div>
      <Button variant="primary" class="w-full" onclick={() => send({ type: 'bulloff_rethrow' })}>
        Throw again
      </Button>

    {:else if result}
      <div role="status" class="flex items-center justify-between gap-3 px-5 py-4 rounded-[14px] bg-surface-2 border border-line-2">
        <span class="flex flex-col gap-1 min-w-0">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-muted">{name(result.order[0])} throws first</span>
          <span class="text-[14px] text-text truncate">Order: {result.order.map(name).join(', ')}</span>
        </span>
        {#if countdown !== null}
          <span class="font-display font-bold text-[40px] leading-none tabular-nums">0:0{countdown}</span>
        {/if}
      </div>
      <div class="flex gap-3">
        <Button variant="outline" class="h-[54px]" onclick={() => send({ type: 'bulloff_rethrow' })}>Throw again</Button>
        <Button variant="primary" class="flex-grow" onclick={() => send({ type: 'bulloff_start' })}>Start now</Button>
      </div>

    {:else}
      <div role="status" class="flex items-center justify-between gap-4 px-5 py-3 rounded-[14px] bg-surface-2 border border-line-2">
        <span class="flex flex-col gap-[2px]">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-muted">To beat</span>
          <span class="text-[13px] text-text-dim">{best ? `set by ${name(best.player)}` : 'No dart on the board yet'}</span>
        </span>
        <span class="flex items-baseline gap-1 font-display font-bold leading-none text-accent">
          <span class="text-[56px]">{best ? fmtMm(bullOff.throws[best.player]) : '—'}</span>
          {#if best}<span class="text-[20px]">mm</span>{/if}
        </span>
      </div>

      <div class="flex items-center gap-3">
        <Button variant="outline" disabled={!currentThrow} onclick={() => send({ type: 'undo_dart' })}>Undo</Button>
        {#if manual}
          <span class="flex-grow text-center text-[14px] text-text-muted">
            {currentThrow ? `${name(current)} has thrown` : `Click where ${name(current)}'s dart landed`}
          </span>
          <Button variant="outline" disabled={!currentThrow} onclick={() => send({ type: 'takeout' })}>Next</Button>
        {:else}
          <span class="flex-grow text-center text-[14px] text-text-muted">
            {currentThrow ? 'Pull the dart to continue' : `${name(current)}: one dart at the bull`}
          </span>
        {/if}
        <Button variant="ghost" onclick={() => send({ type: 'bulloff_skip' })}>Skip</Button>
      </div>
    {/if}
  </aside>
</div>
