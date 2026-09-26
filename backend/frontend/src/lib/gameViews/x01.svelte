<script lang="ts">
  import type { PlayerStatsProps } from './index.js'

  let { game, playerIndex, isActive, previousVisits = [] }: PlayerStatsProps = $props()

  const scores    = $derived(game.scores as number[] | undefined)
  const remaining = $derived(scores?.[playerIndex] ?? 0)
  const opened    = $derived((game.opened as boolean[] | undefined)?.[playerIndex] ?? true)
  const outMode   = $derived((game.config as any)?.outMode ?? 'double')
  const legsWon   = $derived((game.legs as number[])?.[playerIndex] ?? 0)
  const firstTo   = $derived((game.firstTo as number) ?? 3)
  const bust      = $derived(isActive && !!(game.bustThisVisit))

  // Show last 7 visits, newest first
  const recentVisits = $derived([...previousVisits].reverse().slice(0, 7))
  const avg = $derived(
    previousVisits.length
      ? Math.round(previousVisits.reduce((a, b) => a + b, 0) / previousVisits.length)
      : null
  )
</script>

<div class="flex flex-col py-4 gap-3 flex-1 min-h-0">

  <!-- Remaining score + BUST badge -->
  <div class="flex items-baseline gap-3">
    <span class="font-black tabular-nums leading-none text-[clamp(64px,10vw,160px)]
                 {bust ? 'text-[#c94a3a]' : isActive ? 'text-text' : 'text-[#b4b5aa]'}">
      {remaining}
    </span>
    {#if bust}
      <span class="inline-flex items-center h-7 px-3 rounded-full bg-[#3a1a15] border border-[#6a2a20]
                   text-[#e05a45] text-[12px] font-bold tracking-[0.1em] uppercase">
        Bust
      </span>
    {/if}
  </div>

  <!-- Out mode + open status -->
  <span class="text-[13px] uppercase tracking-[0.08em]
               {isActive ? 'text-text-muted' : 'text-text-dim'}">
    {outMode} out
    {#if !opened}
      · <span class="text-accent">needs open</span>
    {/if}
  </span>

  <!-- Leg dots -->
  <div class="flex items-center gap-[6px]">
    {#each Array.from({ length: firstTo }, (_, i) => i) as i}
      <span class="w-3 h-3 rounded-full {i < legsWon
        ? (isActive ? 'bg-accent' : 'bg-text-muted')
        : 'border border-[#5a5e53] box-border'}">
      </span>
    {/each}
  </div>

  <!-- Chalkboard visit history -->
  {#if recentVisits.length > 0}
    <div class="mt-auto flex flex-col gap-0 min-h-0">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase tracking-[0.12em] font-semibold
                     {isActive ? 'text-text-dim' : 'text-[#4a4e45]'}">
          Visits
        </span>
        {#if avg !== null}
          <span class="text-[10px] uppercase tracking-[0.1em]
                       {isActive ? 'text-text-dim' : 'text-[#4a4e45]'}">
            avg <strong class="{isActive ? 'text-text-muted' : 'text-[#6a6e63]'}">{avg}</strong>
          </span>
        {/if}
      </div>
      <div class="flex flex-col gap-0 border-t {isActive ? 'border-[#2e3229]' : 'border-[#252820]'}">
        {#each recentVisits as v, i}
          <div class="flex items-center justify-end py-[3px] border-b
                      {isActive ? 'border-[#2e3229]' : 'border-[#252820]'}">
            <span class="font-display font-bold tabular-nums text-[20px] leading-none
                         {i === 0
                           ? (isActive ? 'text-text' : 'text-[#9a9e95]')
                           : (isActive ? 'text-text-muted' : 'text-[#6a6e63]')}">
              {v}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

</div>
