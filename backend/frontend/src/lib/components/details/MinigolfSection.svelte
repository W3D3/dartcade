<script lang="ts">
  // Minigolf match details section: two title-tabs like X01Section's, "Summary" (the scorecard) and
  // "Shots" (one hole at a time, picked by its number: everyone's strokes on it, as between holes).
  // Summary is the default; neither the view nor the hole is in the URL.
  import { Tabs } from 'bits-ui'
  import type { GameDetail } from '$lib/api'
  import Scorecard from '$lib/components/minigolf/Scorecard.svelte'
  import HoleShots from '$lib/components/minigolf/HoleShots.svelte'

  // `view` and `hole` (0-based) are only where it opens
  let { detail, view = 'summary', hole: firstHole = 0 }: { detail: GameDetail; view?: 'summary' | 'shots'; hole?: number } = $props()
  const golf = $derived(detail.detail.mode === 'minigolf' ? detail.detail : null)
  const players = $derived([...detail.game.players].sort((a, b) => a.seat - b.seat))

  // bits-ui tab values are strings
  // svelte-ignore state_referenced_locally
  let hole = $state(String(firstHole))
  const shown = $derived(golf?.holes[Number(hole)])
</script>

{#if golf}
  <Tabs.Root bind:value={view} class="card box-border flex min-w-0 flex-col gap-4 p-4 md:p-6">
    <h2 class="sr-only">Match view</h2>
    <Tabs.List aria-label="Match view" class="flex items-end gap-[22px]">
      {#each [{ key: 'summary', label: 'Summary' }, { key: 'shots', label: 'Shots' }] as t (t.key)}
        <Tabs.Trigger
          value={t.key}
          class="cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 pb-[6px] font-display text-[24px] font-bold uppercase leading-none text-text-dim hover:text-text data-[state=active]:text-text data-[state=active]:shadow-[inset_0_-3px_0_var(--color-accent)] md:text-[32px]"
          >{t.label}</Tabs.Trigger
        >
      {/each}
    </Tabs.List>

    <Tabs.Content value="summary" class="flex min-w-0 flex-col gap-3">
      <h3 class="m-0 font-display text-[14px] font-bold uppercase tracking-[0.06em] text-text-dim">Scorecard · {golf.course}</h3>
      <Scorecard scores={golf.scores} pars={golf.holes.map(h => h.par)} {players} />
    </Tabs.Content>

    <Tabs.Content value="shots" class="flex min-w-0 flex-col gap-4">
      <Tabs.Root bind:value={hole} class="flex min-w-0 flex-col gap-4">
        <!-- Scrolls sideways on a phone rather than wrapping into a second row -->
        <Tabs.List aria-label="Hole" class="scrollbar-themed flex max-w-full gap-1 self-start overflow-x-auto rounded-[10px] bg-bg p-1">
          {#each golf.holes as h, i (i)}
            <Tabs.Trigger
              value={String(i)}
              aria-label="Hole {i + 1}, {h.name}"
              class="h-10 min-w-11 shrink-0 cursor-pointer rounded-[7px] border-0 bg-transparent px-3 font-[inherit] text-[15px] text-ink-2 data-[state=active]:bg-accent data-[state=active]:font-bold data-[state=active]:text-accent-fg"
              >{i + 1}</Tabs.Trigger
            >
          {/each}
        </Tabs.List>
        {#if shown}
          <Tabs.Content value={hole} class="flex min-w-0 flex-col gap-2">
            <h3 class="m-0 flex items-baseline justify-between gap-2 text-[17px] font-semibold">
              <span>Hole {Number(hole) + 1} · {shown.name}</span><span class="text-[14px] font-normal text-text-muted">Par {shown.par}</span
              >
            </h3>
            {#if shown.paths.some(s => s.length > 0)}
              <HoleShots
                hole={shown}
                paths={shown.paths}
                scores={golf.scores[Number(hole)] ?? []}
                {players}
                label="Everyone's strokes on hole {Number(hole) + 1}"
                height="max-h-[560px]"
              />
            {:else}
              <p class="m-0 text-text-muted">Nobody played this hole.</p>
            {/if}
          </Tabs.Content>
        {/if}
      </Tabs.Root>
    </Tabs.Content>
  </Tabs.Root>
{/if}
