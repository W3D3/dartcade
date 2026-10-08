<script lang="ts">
  // Party: place, player and one column per compact stat row, the better value in lime.
  import Avatar from '$lib/components/Avatar.svelte'
  import type { StatRow } from '$lib/api'
  import { ordinal } from '$lib/fmt'
  import { betterIndexes, formatStat } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'

  let { rows, sides }: { rows: StatRow[]; sides: DetailSide[] } = $props()
  const compact = $derived(rows.filter(r => r.compact))
  const ranked = $derived([...sides].sort((a, b) => a.placement - b.placement))
  const all = $derived(sides.map(s => ({ index: s.index, values: s.values })))
</script>

<section aria-label="Standings and match stats" class="card overflow-x-auto">
  <table class="w-full border-collapse text-[15px]">
    <thead>
      <tr class="text-[12px] label-caps text-text-dim">
        <th class="text-left font-normal px-4 py-3">Place</th>
        <th class="text-left font-normal px-2 py-3">Player</th>
        {#each compact as row (row.key)}<th class="text-right font-normal px-3 py-3 whitespace-nowrap">{row.label}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each ranked as s (s.index)}
        <tr class="border-t border-line {s.me ? 'bg-surface-active' : ''}">
          <td class="px-4 py-3 font-display font-bold text-[20px]">{ordinal(s.placement)}</td>
          <td class="px-2 py-3"
            ><span class="flex items-center gap-2"
              ><Avatar name={s.name} size={28} guest={s.guest} bot={s.bot} /><span class="font-semibold">{s.name}</span
              >{#if s.forfeited}<span class="text-[12px] text-danger-text">gave up</span>{/if}</span
            ></td
          >
          {#each compact as row (row.key)}
            <td class="px-3 py-3 text-right whitespace-nowrap {betterIndexes(row, all).has(s.index) ? 'text-accent font-bold' : ''}"
              >{formatStat(row, s.values)}</td
            >
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>
