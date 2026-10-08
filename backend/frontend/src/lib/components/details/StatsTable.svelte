<script lang="ts">
  // Match stats for two sides: left value | label | right value, the better value in lime.
  // Any mode: the rows come from the server. Solo: one value column.
  import type { StatRow } from '$lib/api'
  import { betterIndexes, formatStat } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'

  let { rows, sides, title = 'Match stats' }: { rows: StatRow[]; sides: DetailSide[]; title?: string } = $props()
  const left = $derived(sides[0])
  const right = $derived(sides.at(1))
  const H = 'text-[12px] label-caps text-text-dim'
</script>

{#if rows.length > 0}
  <section aria-label={title} class="flex flex-col min-h-0 box-border px-4 md:px-6 pt-4 pb-2 card">
    <div class="grid grid-cols-[1fr_1.3fr_1fr] pb-2 border-b border-line-2">
      <span class={H}>{left.name}</span><span class="{H} text-center">{title}</span><span class="{H} text-right">{right?.name ?? ''}</span>
    </div>
    {#each rows as row (row.key)}
      {@const best = betterIndexes(
        row,
        sides.map(s => ({ index: s.index, values: s.values })),
      )}
      <!-- Phones show the compact rows only (Mobile-X01-Details) -->
      <div
        class="grid grid-cols-[1fr_1.3fr_1fr] items-center min-h-11 border-b border-line last:border-b-0 {row.compact
          ? ''
          : 'max-md:hidden'}"
      >
        <span class="text-[16px] {best.has(left.index) ? 'text-accent font-bold' : 'text-text font-semibold'}"
          >{formatStat(row, left.values)}</span
        >
        <span class="text-center text-[14px] text-text-muted">{row.label}</span>
        <span class="text-right text-[16px] {right && best.has(right.index) ? 'text-accent font-bold' : 'text-ink-2 font-medium'}"
          >{right ? formatStat(row, right.values) : ''}</span
        >
      </div>
    {/each}
  </section>
{/if}
