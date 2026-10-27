<!--
  The Higher Lower match screen (HiLo-Duel, -LifeLost, -Party, -Phone). Two players: a panel either
  side, the scale and the board in the centre, then This visit, the slots and the controls. Three or
  more: stacked rows, then the board and the scale. Portrait screens: the rows on top, the horizontal
  scale, This visit, the slots and the controls, then the board. Phones: the other players' rows, the thrower's
  card, the horizontal scale, the board, the slots and the controls. A visit that just lost a life
  shows the red banner in place of This visit until the next dart.
-->
<script lang="ts">
  import type { Segment } from '$lib/api'
  import type { HiloGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import DartKeypad from '$lib/components/DartKeypad.svelte'
  import DartSlots from '$lib/components/DartSlots.svelte'
  import HiloPanel from '$lib/components/hilo/HiloPanel.svelte'
  import HiloPhoneCard from '$lib/components/hilo/HiloPhoneCard.svelte'
  import HiloRow from '$lib/components/hilo/HiloRow.svelte'
  import HiloScale from '$lib/components/hilo/HiloScale.svelte'
  import { hiloSlots } from '$lib/dartSlots'
  import { bannerText, highHint, zoneOf } from '$lib/hilo/view'
  import type { MatchLayout } from '$lib/matchLayout'

  let {
    game,
    players,
    darts,
    layout,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onCorrect,
    keypad = false,
    onDart = () => {},
  }: {
    game: HiloGame
    players: { name: string }[]
    /** The open visit's darts, drawn where they landed. */
    darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
    layout: MatchLayout
    canThrow: boolean
    locked: boolean
    canUndo: boolean
    next: { label: string; prominent: boolean; enabled: boolean }
    onUndo: () => void
    onNext: () => void
    onBoardClick: (hit: { segment: Segment; coords: { x: number; y: number } }) => void
    onCorrect: (dartIndex: number, label: string) => void
    /** The header's Enter view: the keypad takes the board's place. */
    keypad?: boolean
    onDart?: (segment: Segment) => void
  } = $props()

  const cp = $derived(game.currentPlayer)
  const playing = $derived(game.phase === 'game')
  const hint = $derived(playing && !locked ? highHint(game, darts.length) : null)
  const slots = $derived(hiloSlots({ darts, hint: hint && { need: hint.need, high: game.high }, locked: game.visitLocked }))
  let openDart = $state<number | null>(null)
  const name = (i: number) => players[i]?.name ?? ''
  // The life-lost moment: the backend keeps lastResult until the next dart
  const r = $derived(game.lastResult)
  const banner = $derived(r ? bannerText(r) : null)
  const seatProps = (i: number) => ({
    game,
    seat: i,
    name: name(i),
    active: i === cp && playing,
    upNext: i === game.nextPlayer && i !== cp,
    justLost: banner !== null && r?.seat === i,
  })
  const marker = $derived(
    darts.length > 0 ? { total: game.visitTotal, lost: game.visitLocked, open: true } : banner && r ? { total: r.total, lost: true } : null,
  )
  const zone = $derived(zoneOf(game.visitTotal, game))
  const ZONE_PILL = { 'safe-high': 'Above HIGH', 'safe-low': 'Below LOW', danger: 'Between the bars' } as const
  // Below LOW isn't safe yet: a takeout now counts the darts not thrown as misses
  const toGo = $derived(game.visitLocked || zone !== 'safe-low' ? 0 : Math.max(0, 3 - darts.length))
  const pill = $derived(
    darts.length === 0 ? null : game.visitLocked ? 'Missed · −1 life' : toGo > 0 ? `${ZONE_PILL[zone]} · ${toGo} to go` : ZONE_PILL[zone],
  )
  const red = $derived(game.visitLocked || zone === 'danger')
  // With a thrown dart selected, a key replaces it (as on GameDisplay's phone keypad)
  function keyDart(segment: Segment): void {
    if (openDart === null) {
      onDart(segment)
      return
    }
    onCorrect(openDart, segment.name)
    openDart = null
  }
</script>

{#snippet board()}
  {#if keypad}
    <div class="flex-1 min-h-0 min-w-0">
      <DartKeypad
        onDart={keyDart}
        replacing={openDart}
        dartCount={darts.length}
        {locked}
        disabled={!canThrow}
        {canUndo}
        {onUndo}
        nextLabel={next.label}
        nextEnabled={next.enabled}
        nextProminent={next.prominent}
        {onNext}
      />
    </div>
  {:else}
    <div class="flex-1 min-h-[160px] min-w-0 w-full [container-type:size] flex items-center justify-center">
      <div class="relative aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} onBoardClick={canThrow && !locked ? onBoardClick : undefined} selectedDart={openDart} />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet band()}
  {#if banner}
    {@const [head, rest] = banner.split(' · ')}
    <div role="alert" class="h-[72px] shrink-0 box-border px-5 flex items-center gap-4 rounded-[14px] bg-live-soft border-2 border-live">
      <span class="font-display font-bold text-[40px] xl:text-[48px] leading-none text-live whitespace-nowrap">{head}</span>
      <span class="text-[16px] xl:text-[18px] text-[#ffd2cd] truncate">{rest}</span>
      <span class="ml-auto hidden xl:inline text-[14px] text-[#ffb4ad] whitespace-nowrap">Bars stay put</span>
    </div>
  {:else}
    <div
      role="status"
      class="relative h-[72px] shrink-0 box-border flex items-center justify-center rounded-[14px] bg-surface-panel border border-line-2"
    >
      <span class="absolute left-5 top-1/2 -translate-y-1/2 text-[14px] label-caps text-text-muted">This visit</span>
      <span class="font-display font-bold text-[66px] leading-[0.85] {pill && !toGo ? (red ? 'text-live' : 'text-accent') : ''}"
        >{game.visitTotal}</span
      >
      {#if pill}
        <span
          class="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-bold uppercase tracking-[0.08em]
                 {red ? 'bg-live-soft text-live-text' : toGo ? 'bg-surface-2 text-text' : 'bg-accent-tint text-accent'}">{pill}</span
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet controls(compact: boolean)}
  {#if !keypad}
    <ControlBar {compact} {canUndo} label={next.label} prominent={next.prominent} enabled={next.enabled} {onUndo} {onNext} />
  {/if}
{/snippet}

{#snippet center()}
  <div class="flex-1 min-h-0 flex items-stretch justify-center gap-4">
    <HiloScale {game} {marker} orientation="vertical" />
    {@render board()}
  </div>
  {@render band()}
  <DartSlots {slots} {onCorrect} bind:openDart />
  {@render controls(false)}
{/snippet}

{#if layout === 'phone'}
  <main class="flex-grow min-h-0 overflow-y-auto box-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2">
    <div class="shrink-0 max-h-[30%] overflow-y-auto flex flex-col gap-2">
      {#each game.seats as _, i (i)}
        {#if i !== cp || !playing}<HiloPhoneCard {...seatProps(i)} />{/if}
      {/each}
    </div>
    {#if playing}<HiloPhoneCard {...seatProps(cp)} />{/if}
    <HiloScale {game} {marker} orientation="horizontal" />
    {#if banner}{@render band()}{/if}
    {@render board()}
    <div class="relative shrink-0"><DartSlots {slots} {onCorrect} bind:openDart showPopover={!keypad} popoverAbove /></div>
    {@render controls(true)}
  </main>
{:else if layout === 'portrait'}
  <!-- Upright screens: the players' rows on top, the scale across, this visit, the slots and controls, then the board -->
  <main class="flex-grow min-h-0 box-border px-5 pt-4 pb-5 gap-3 lg:px-7 lg:pt-6 lg:pb-7 lg:gap-[18px] flex flex-col">
    <div class="shrink-0 max-h-[40%] overflow-y-auto flex flex-col gap-3">
      {#each game.seats as _, i (i)}<HiloRow {...seatProps(i)} />{/each}
    </div>
    <HiloScale {game} {marker} orientation="horizontal" />
    {@render band()}
    <DartSlots {slots} {onCorrect} bind:openDart />
    {@render controls(false)}
    {@render board()}
  </main>
{:else if layout === 'duel'}
  <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
    <HiloPanel {...seatProps(0)} />
    <div class="flex-[0_1_706px] min-w-0 min-h-0 flex flex-col gap-3">{@render center()}</div>
    <HiloPanel {...seatProps(1)} />
  </main>
{:else}
  <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
    <div class="flex-1 min-w-0 min-h-0 flex flex-col gap-3 overflow-y-auto">
      {#each game.seats as _, i (i)}<HiloRow {...seatProps(i)} />{/each}
    </div>
    <aside aria-label="Board and scale" class="w-[400px] xl:w-[622px] shrink-0 min-h-0 flex flex-col gap-3">{@render center()}</aside>
  </main>
{/if}
