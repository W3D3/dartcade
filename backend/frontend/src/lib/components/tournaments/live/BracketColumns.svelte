<script lang="ts">
  // A knockout bracket as columns per round (Tournament-Live), lines joining each pair of matches
  // to the match their winners meet in, and the champion's trophy after the last column. Wider
  // than a phone: the caller scrolls it sideways.
  import { Trophy } from '@lucide/svelte'
  import MatchCard from './MatchCard.svelte'
  import type { Column, LiveEntry } from '$lib/tournaments/live'

  let {
    columns,
    entries,
    mine,
    champion = null,
    trophy = false,
  }: {
    columns: readonly Column[]
    entries: readonly LiveEntry[]
    mine: string | null
    champion?: LiveEntry | null
    trophy?: boolean
  } = $props()

  // Each match gets this much height in the busiest column; later columns spread theirs out
  const SLOT = 104
  const LINK = 28
  const height = $derived(Math.max(1, ...columns.map(c => c.matches.length)) * SLOT)
  const centre = (i: number, n: number) => ((i + 0.5) / n) * height
  /** The joining lines from a column to the next, when the next takes the winners of each pair. */
  function links(from: Column, to: Column | undefined): string[] {
    const n = from.matches.length
    if (!to || to.matches.length * 2 !== n) return []
    return to.matches.map((_, j) => {
      const [a, b, c] = [centre(2 * j, n), centre(2 * j + 1, n), centre(j, n / 2)]
      return `M0 ${a}H${LINK / 2}V${b}H0M${LINK / 2} ${c}H${LINK}`
    })
  }
</script>

<div class="flex w-max items-start">
  {#each columns as col, i (col.name)}
    <div class="flex shrink-0 flex-col gap-3.5">
      <span class="text-center label-caps text-caption font-bold text-text-muted">{col.name}</span>
      <div class="flex flex-col justify-around" style="height:{height}px">
        {#each col.matches as m (m.key)}
          <MatchCard match={m} {entries} {mine} />
        {/each}
      </div>
    </div>
    {#if i < columns.length - 1}
      <svg width={LINK} {height} class="mt-[34px] shrink-0 text-line-2" aria-hidden="true">
        {#each links(col, columns[i + 1]) as d (d)}<path {d} fill="none" stroke="currentColor" stroke-width="1.5" />{/each}
      </svg>
    {/if}
  {/each}
  {#if trophy}
    <div class="ml-3.5 flex shrink-0 flex-col items-center gap-2.5 self-center pt-[34px] text-gold">
      <Trophy size={30} aria-hidden="true" />
      <span class="font-display text-body-lg font-bold uppercase">{champion?.name ?? 'Champion'}</span>
    </div>
  {/if}
</div>
