<!--
  A Higher Lower duel panel (HiLo-Duel, -LifeLost): name and pill, the hearts, what the player
  needs, the last visit and the visit list. The thrower's panel is lime, the panel of a player who
  just lost a life red.
-->
<script lang="ts">
  import { X } from '@lucide/svelte'
  import type { HiloGame } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import PlayerPill from '$lib/components/PlayerPill.svelte'
  import Hearts from '$lib/components/hilo/Hearts.svelte'
  import { ordinal, plural } from '$lib/fmt'
  import { needsLine, outcomeText } from '$lib/hilo/view'
  import { LOST_CARD, playerCard } from '$lib/playerCard'

  let {
    game,
    seat,
    name,
    active,
    upNext,
    justLost,
  }: {
    game: HiloGame
    seat: number
    name: string
    /** Throwing now. */
    active: boolean
    upNext: boolean
    /** Lost a life in the visit that just ended (the LifeLost moment). */
    justLost: boolean
  } = $props()

  const s = $derived(game.seats[seat])
  const last = $derived(s.visits.at(-1))
  const lostVisit = (o: string) => o === 'between' || o === 'miss'
  const lit = $derived(active || justLost)
  // The open visit's row, once a dart is in
  const throwing = $derived(active && game.currentVisitDarts.length > 0)
  const card = $derived(justLost ? LOST_CARD : playerCard(active))
  // Lit (thrower, life lost) or quiet colours for a visit's result
  const resultTone = (lost: boolean) => (lost ? (lit ? 'text-live-text' : 'text-[#e0827a]') : lit ? 'text-accent' : 'text-[#a7c45a]')
  const state = $derived(justLost ? 'just lost a life' : active ? 'throwing' : upNext ? 'up next' : s.out ? 'out' : 'waiting')
</script>

<section
  aria-label="{name}, {state}, {s.lives} of {plural(game.cfg.lives, 'life', 'lives')}"
  class="flex-1 min-w-[220px] min-h-0 box-border p-4 xl:p-[26px] rounded-[18px] flex flex-col gap-3 xl:gap-[18px] {card}"
>
  <!-- Narrow panels (below xl): the pill wraps under the name rather than cutting it short -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
    <span class="flex items-center gap-3 min-w-0 max-w-full">
      <Avatar {name} tone={active ? 'accent' : 'default'} size={40} />
      <span class="text-[22px] font-semibold truncate {lit ? 'text-text' : 'text-ink-2'}">{name}</span>
    </span>
    <span class="ml-auto">
      {#if justLost}
        <span class="inline-flex items-center h-7 px-3 rounded-full bg-live text-bg text-[13px] font-bold uppercase tracking-[0.08em]"
          >−1 life</span
        >
      {:else if s.out}
        <span
          class="inline-flex items-center h-7 px-3 rounded-full bg-surface-paused text-text-dim text-[13px] font-bold uppercase tracking-[0.08em]"
          >Out{s.place ? ` · ${ordinal(s.place)}` : ''}</span
        >
      {:else if active}<PlayerPill kind="throwing" />{:else if upNext}<PlayerPill kind="up-next" />{/if}
    </span>
  </div>

  <div class="flex flex-col gap-2">
    <span class="text-[13px] label-caps text-text-muted">Lives · {s.lives} of {game.cfg.lives}</span>
    <Hearts lives={s.lives} total={game.cfg.lives} tone={lit ? 'accent' : 'muted'} {justLost} size="w-9 h-9 xl:w-12 xl:h-12" />
  </div>

  {#if active || justLost}
    <div class="flex flex-col gap-1">
      <span class="text-[13px] label-caps text-text-muted">{justLost ? 'Needed' : 'Needs'}</span>
      <span class="font-display font-bold text-[28px] xl:text-[40px] leading-none {active ? 'text-accent' : 'text-ink-3'}"
        >{needsLine(game)}</span
      >
    </div>
  {/if}

  {#if last}
    <div class="flex flex-col gap-[6px]">
      <span class="text-[13px] label-caps text-text-muted">Last visit</span>
      {#if lostVisit(last.outcome)}
        <span
          class="flex items-center gap-[10px] px-3 py-[10px] rounded-[10px] text-[15px] border
                 {lit ? 'bg-[#24120f] border-[#6b2a24] text-[#ffb4ad]' : 'bg-[#1f1513] border-[#4a2420] text-[#e0a39d]'}"
        >
          <X size={16} strokeWidth={3} class="text-live shrink-0" />{outcomeText(last)}
        </span>
      {:else}
        <span class="text-[15px] {resultTone(false)}">{outcomeText(last)}</span>
      {/if}
    </div>
  {/if}

  {#if s.visits.length || throwing}
    <div
      role="group"
      aria-label="{name}'s visits this game"
      class="mt-auto min-h-0 overflow-hidden px-3 py-2 rounded-[12px] border flex flex-col justify-end
             {justLost ? 'bg-[#241a17] border-[#3a2420]' : active ? 'bg-surface-chip border-line-2' : 'bg-surface-inset border-line-2'}"
    >
      {#each s.visits as v, i (i)}
        {@const now = justLost && i === s.visits.length - 1}
        <div
          class="shrink-0 grid grid-cols-[28px_48px_1fr] xl:grid-cols-[40px_64px_1fr] items-center h-[42px] border-b border-line-2 last:border-b-0
                 {now ? 'bg-live-soft rounded-[8px] -mx-[6px] px-[6px] border-b-0' : ''}"
        >
          <span class="font-mono text-[12px] {now ? 'text-live-text' : 'text-text-dim'}">R{v.round}</span>
          <span class="font-display font-bold text-[30px] {now ? 'text-live-text' : lit ? 'text-ink-soft' : 'text-ink-3'}">{v.total}</span>
          <span class="text-right text-[14px] whitespace-nowrap {now ? 'text-text' : resultTone(lostVisit(v.outcome))}"
            >{lostVisit(v.outcome) ? '−1 life' : v.outcome === 'high' ? 'Set HIGH' : 'Set LOW'}</span
          >
        </div>
      {/each}
      {#if throwing}
        <div
          class="shrink-0 grid grid-cols-[28px_48px_1fr] xl:grid-cols-[40px_64px_1fr] items-center h-11 mt-1 -mx-[6px] px-[6px] rounded-[8px] bg-surface-key"
        >
          <span class="font-mono text-[12px] text-accent">R{game.round}</span>
          <span class="font-display font-bold text-[30px] text-accent">{game.visitTotal}…</span>
          <span class="text-right text-[14px] text-text">throwing</span>
        </div>
      {/if}
    </div>
  {/if}
</section>
