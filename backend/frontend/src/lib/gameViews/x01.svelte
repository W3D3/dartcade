<script lang="ts">
  import type { PlayerStatsProps } from './index.js'
  import { checkoutHint } from '$lib/dartUtils.js'

  let { game, playerIndex, isActive, previousVisits = [] }: PlayerStatsProps = $props()

  const scores    = $derived(game.scores as number[] | undefined)
  const remaining = $derived(scores?.[playerIndex] ?? 0)
  const opened    = $derived((game.opened as boolean[] | undefined)?.[playerIndex] ?? true)
  const bust      = $derived(isActive && !!(game.bustThisVisit))

  const outMode      = $derived(((game.config as any)?.outMode ?? 'double') as 'straight' | 'double' | 'master')
  const dartsLeft    = $derived(isActive ? 3 - ((game.currentVisitDarts as unknown[]) ?? []).length : 3)
  const checkout     = $derived(checkoutHint(remaining, outMode, dartsLeft))
  const checkoutText = $derived(checkout ? checkout.join(' · ') : null)

  const totalDarts   = $derived((game.totalDarts as number[] | undefined)?.[playerIndex] ?? previousVisits.length * 3)
  const avg          = $derived(
    previousVisits.length
      ? (previousVisits.reduce((a, b) => a + b, 0) / previousVisits.length).toFixed(1)
      : null
  )

  const lastVisits   = $derived(previousVisits.slice(-3).reverse())
  const recentVisits = $derived([...previousVisits].reverse().slice(0, 7))
</script>

<div class="flex flex-col py-3 gap-3 flex-1 min-h-0">

  <!-- Score + bust -->
  <div class="flex items-baseline gap-3">
    <span class="font-display font-black tabular-nums leading-none text-[clamp(64px,10vw,160px)]
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

  <!-- Checkout box -->
  {#if !opened}
    <div class="flex flex-col gap-1 p-[14px_16px] rounded-[10px]
                {isActive ? 'bg-[#1e2119]' : 'bg-[#1a1c18]'}">
      <span class="text-[11px] tracking-[0.1em] uppercase {isActive ? 'text-text-muted' : 'text-text-dim'}">
        Needs to open
      </span>
    </div>
  {:else if checkoutText}
    <div class="flex flex-col gap-1 p-[14px_16px] rounded-[10px]
                {isActive ? 'bg-[#1e2119]' : 'bg-[#1a1c18]'}">
      <span class="text-[11px] tracking-[0.1em] uppercase {isActive ? 'text-text-muted' : 'text-text-dim'}">
        {#if isActive}Checkout · {dartsLeft} dart{dartsLeft === 1 ? '' : 's'} left{:else}Checkout{/if}
      </span>
      <span class="font-display font-bold text-[32px] leading-none
                   {isActive ? 'text-accent' : 'text-[#b4b5aa]'}">
        {checkoutText}
      </span>
    </div>
  {/if}

  <!-- Avg + Darts -->
  {#if avg !== null}
    <div class="flex gap-6 text-[14px] {isActive ? 'text-text-muted' : 'text-text-dim'}">
      <span>Avg <strong class="font-semibold {isActive ? 'text-text' : 'text-[#c9c9bf]'}">{avg}</strong></span>
      <span>Darts <strong class="font-semibold {isActive ? 'text-text' : 'text-[#c9c9bf]'}">{totalDarts}</strong></span>
    </div>
  {/if}

  <!-- Chalkboard visit history -->
  {#if recentVisits.length > 0}
    <div class="mt-auto flex flex-col gap-0 min-h-0">
      <div class="mb-1">
        <span class="text-[10px] uppercase tracking-[0.12em] font-semibold
                     {isActive ? 'text-text-dim' : 'text-[#4a4e45]'}">
          Visits
        </span>
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

  <!-- Last visits row -->
  {#if lastVisits.length > 0}
    <div class="flex items-center gap-3 text-[13px] {isActive ? 'text-text-dim' : 'text-[#4a4e45]'}">
      <span>Last visits</span>
      {#each lastVisits as v}
        <span class="tabular-nums {isActive ? 'text-text-muted' : 'text-[#6a6e63]'}">{v}</span>
      {/each}
    </div>
  {/if}

</div>
