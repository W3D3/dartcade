<script lang="ts">
  // Party: place, player and one column per compact stat row, the better value in lime. A leg's
  // table (`ranked` off) keeps seat order and leaves out the match's places.
  import Avatar from '$lib/components/Avatar.svelte'
  import ProfilePopover from '$lib/components/progress/ProfilePopover.svelte'
  import type { StatRow } from '$lib/api'
  import { ordinal } from '$lib/fmt'
  import { betterIndexes, formatStat } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'

  let { rows, sides, ranked = true }: { rows: StatRow[]; sides: DetailSide[]; ranked?: boolean } = $props()
  const compact = $derived(rows.filter(r => r.compact))
  const order = $derived(ranked ? [...sides].sort((a, b) => a.placement - b.placement) : sides)
  const all = $derived(sides.map(s => ({ index: s.index, values: s.values })))
</script>

<section aria-label="Standings and match stats" class="card overflow-x-auto">
  <table class="w-full border-collapse text-[15px]">
    <thead>
      <tr class="text-[12px] label-caps text-text-dim">
        {#if ranked}<th class="text-left font-normal px-4 py-3">Place</th>{/if}
        <th class="text-left font-normal {ranked ? 'px-2' : 'px-4'} py-3">Player</th>
        {#each compact as row (row.key)}<th class="text-right font-normal px-3 py-3 whitespace-nowrap">{row.label}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each order as s (s.index)}
        <tr class="border-t border-line {s.me ? 'bg-surface-active' : ''}">
          {#if ranked}<td class="px-4 py-3 font-display font-bold text-[20px]">{ordinal(s.placement)}</td>{/if}
          <td class="{ranked ? 'px-2' : 'px-4'} py-3"
            ><span class="flex items-center gap-2"
              ><ProfilePopover userId={s.userId} name={s.name}
                ><Avatar name={s.name} size={28} guest={s.guest} face={s} /><span class="font-semibold whitespace-nowrap">{s.name}</span
                ></ProfilePopover
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
