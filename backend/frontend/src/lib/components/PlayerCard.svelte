<script lang="ts">
  import type { GameView } from '../gameViews/index.js'
  import { checkoutHint } from '$lib/dartUtils.js'

  let { player, playerIndex, game, view, isActive, isWinner, previousVisits } = $props<{
    player: { id?: string; name: string }
    playerIndex: number
    game: Record<string, unknown>
    view: GameView
    isActive: boolean
    isWinner: boolean
    previousVisits: number[]
  }>()

  const display = $derived(view.getPlayerDisplay(game, playerIndex))
  const remaining = $derived(display?.remaining ?? 0)
  const checkout = $derived(checkoutHint(remaining))
  const checkoutText = $derived(checkout ? checkout.join(' · ') : 'No finish — set up')
  const dartsLeft = $derived(display?.dartsLeft ?? 3)
  const avg = $derived(
    previousVisits.length ? (previousVisits.reduce((a, b) => a + b, 0) / previousVisits.length).toFixed(1) : '—'
  )
  const initial = $derived(player.name?.[0]?.toUpperCase() ?? '?')
  const lastVisits = $derived(previousVisits.slice(-3).reverse())
  const legsWon = $derived((game.legs as number[])?.[playerIndex] ?? 0)
  const firstTo = $derived((game.firstTo as number) ?? 3)
</script>

<section
  aria-label="{player.name}, {isActive ? 'throwing' : 'waiting'}"
  class="flex flex-col gap-5 box-border p-7 rounded-[18px] h-full
         {isActive
           ? 'bg-surface-active border-2 border-accent'
           : 'bg-surface-2 border border-line-2'}">

  <!-- Name row + leg dots -->
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-3">
      <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[17px]
                   {isActive ? 'bg-accent text-accent-fg' : 'bg-[#3a3e36] text-text'}">
        {initial}
      </span>
      <span class="text-[22px] font-semibold {isActive ? 'text-text' : 'text-[#c9c9bf]'}">
        {player.name}
      </span>
    </div>
    <div class="flex items-center gap-[6px]" aria-label="{legsWon} leg(s) won">
      {#each Array.from({length: firstTo}, (_, i) => i) as i}
        <span class="w-3 h-3 rounded-full {i < legsWon
          ? (isActive ? 'bg-accent' : 'bg-text-muted')
          : 'border border-[#5a5e53] box-border'}">
        </span>
      {/each}
    </div>
  </div>

  <!-- Status badge -->
  {#if isWinner}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full bg-accent text-accent-fg
                 text-[13px] font-bold tracking-[0.08em] uppercase">Winner!</span>
  {:else if isActive}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full bg-accent text-accent-fg
                 text-[13px] font-bold tracking-[0.08em] uppercase">Throwing</span>
  {:else}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full border border-line
                 text-text-dim text-[13px] font-semibold tracking-[0.08em] uppercase">Up next</span>
  {/if}

  <!-- Remaining score -->
  <span class="font-display font-bold text-[clamp(80px,15vw,220px)] leading-[0.8] tracking-[-0.02em]
               {isActive ? 'text-text' : 'text-[#b4b5aa]'}">
    {remaining}
  </span>

  <!-- Checkout hint -->
  <div class="flex flex-col gap-[6px] p-[16px_18px] rounded-[12px]
              {isActive ? 'bg-[#242820]' : 'bg-[#1c1e1a]'}">
    <span class="text-[12px] tracking-[0.1em] uppercase {isActive ? 'text-text-muted' : 'text-text-dim'}">
      Checkout · {dartsLeft} darts left
    </span>
    <span class="font-display font-bold text-[38px] leading-none
                 {isActive ? 'text-accent' : 'text-[#b4b5aa]'}">
      {checkoutText}
    </span>
  </div>

  <!-- Stats -->
  <div class="flex gap-7 text-[15px] {isActive ? 'text-text-muted' : 'text-text-dim'}">
    <span>Avg <strong class="{isActive ? 'text-text' : 'text-[#c9c9bf]'}">{avg}</strong></span>
    <span>Darts <strong class="{isActive ? 'text-text' : 'text-[#c9c9bf]'}">{(game.totalDarts as number[])?.[playerIndex] ?? '—'}</strong></span>
  </div>

  <!-- Last visits -->
  <div class="mt-auto flex items-center gap-2 text-[13px] text-text-dim">
    <span>Last visits</span>
    {#each lastVisits as v, i}
      <span class="px-[10px] py-1 rounded-[6px]
                   {isActive ? 'bg-[#242820] text-[#c9c9bf]' : 'bg-[#1f221c] text-[#b4b5aa]'}
                   {i === 0 ? 'font-semibold' : 'font-normal'}">
        {v}
      </span>
    {/each}
  </div>
</section>
