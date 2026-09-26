<script lang="ts">
  import type { GameView } from '../gameViews/index.js'

  let { player, playerIndex, game, view, isActive, isWinner, isNext, isLeading } = $props<{
    player: { id?: string; name: string }
    playerIndex: number
    game: Record<string, unknown>
    view: GameView
    isActive: boolean
    isWinner: boolean
    isNext: boolean
    isLeading: boolean
  }>()

  const primary     = $derived(view.getPrimaryDisplay(game, playerIndex))
  const initial     = $derived(player.name?.[0]?.toUpperCase() ?? '?')
  const PlayerStats = $derived(view.PlayerStats)
</script>

<section
  aria-label="{player.name}, {isActive ? 'throwing' : 'waiting'}"
  class="flex items-center gap-6 box-border px-7 py-0 rounded-[14px] h-full
         {isActive
           ? 'bg-surface-active border-2 border-accent'
           : 'bg-surface-2 border border-line-2'}">

  <!-- Avatar + name + badge -->
  <div class="flex items-center gap-4 w-[240px] flex-shrink-0 min-w-0">
    <span class="w-14 h-14 rounded-full flex items-center justify-center font-bold text-[20px] flex-shrink-0
                 {isActive ? 'bg-accent text-accent-fg' : 'bg-[#2e3229] text-text-muted'}">
      {initial}
    </span>
    <div class="flex flex-col gap-[8px] min-w-0">
      <span class="font-bold truncate
                   {isActive ? 'text-[22px] text-text' : 'text-[20px] text-[#8a8e83]'}">
        {player.name}
      </span>
      {#if isWinner}
        <span class="inline-flex items-center h-[24px] px-[10px] rounded-full bg-accent text-accent-fg
                     text-[12px] font-bold tracking-[0.06em] uppercase w-fit">Winner!</span>
      {:else if isActive}
        <span class="inline-flex items-center h-[24px] px-[10px] rounded-full bg-accent text-accent-fg
                     text-[12px] font-bold tracking-[0.06em] uppercase w-fit">Throwing</span>
      {:else if isNext}
        <span class="inline-flex items-center h-[24px] px-[10px] rounded-full border border-line-2
                     text-[#5a5e55] text-[12px] font-semibold tracking-[0.06em] uppercase w-fit">Up next</span>
      {:else if isLeading}
        <span class="inline-flex items-center h-[24px] px-[10px] rounded-full border border-line-2
                     text-[#5a5e55] text-[12px] font-semibold gap-[4px] w-fit">
          <span class="text-[11px]">👑</span>Leading
        </span>
      {/if}
    </div>
  </div>

  <!-- Primary stat: label + large number — vh-based so it fills row height -->
  <div class="flex flex-col justify-center w-[120px] flex-shrink-0">
    <span class="text-[11px] tracking-[0.12em] uppercase font-semibold mb-1
                 {isActive ? 'text-text-muted' : 'text-text-dim'}">
      {primary.label}
    </span>
    <span class="font-display font-black leading-none tracking-tight
                 {isActive
                   ? 'text-[clamp(64px,10vh,130px)] text-accent'
                   : 'text-[clamp(56px,8.5vh,110px)] text-[#5a5e55]'}">
      {primary.value}
    </span>
  </div>

  <!-- Game-specific compact stats -->
  <div class="flex-1 min-w-0 self-stretch flex items-center">
    {#if PlayerStats}
      {@const Stats = PlayerStats}
      <div class="w-full">
        <Stats {game} {playerIndex} {isActive} compact={true} />
      </div>
    {:else}
      <div class="text-[14px] {isActive ? 'text-text-muted' : 'text-[#5a5e55]'}">
        —
      </div>
    {/if}
  </div>
</section>
