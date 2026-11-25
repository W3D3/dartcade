<script lang="ts">
  // The details page's statistics, for any mode: the rows come from the server. From tablets up
  // they are the win screen's comparison bars: two sides face each other (value, label over a split
  // bar, value); three or more get a bar per player under each label. The better value of a row is
  // lime (a row where fewer is better inverts it); exact numbers always show. Phones keep plain
  // text rows (Mobile-X01-Details): left value | label | right value, compact rows only.
  import type { StatRow } from '$lib/api'
  import { barCells, duelShare } from '$lib/details/statBars'
  import { statNumber } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'
  import ProfilePopover from '$lib/components/progress/ProfilePopover.svelte'
  import StatDuelRow from '$lib/components/StatDuelRow.svelte'

  let { rows, sides, title = 'Statistics' }: { rows: StatRow[]; sides: DetailSide[]; title?: string } = $props()
  const duel = $derived(sides.length === 2)
  const H = 'text-caption label-caps text-text-dim'
  const hide = (row: StatRow) => (row.compact ? '' : 'max-md:hidden')
</script>

{#if rows.length > 0}
  <section aria-label={title} class="flex flex-col gap-1 min-h-0 box-border p-4 md:px-6 card">
    <h2 class="sr-only">{title}</h2>
    {#if duel}
      <div class="grid grid-cols-2 md:flex md:justify-between gap-3 md:gap-4 w-full max-w-[760px] mx-auto pb-2 {H}">
        {#each sides as s, i (s.index)}
          <span class="min-w-0 flex {i === 1 ? 'justify-end' : ''}"
            ><ProfilePopover userId={s.userId} name={s.name}><span class="min-w-0 truncate">{s.name}</span></ProfilePopover></span
          >
        {/each}
      </div>
      {#each rows as row (row.key)}
        {@const cells = barCells(row, sides)}
        <div class="border-t border-line first:border-t-0 {hide(row)}">
          <!-- Phones: the plain text row -->
          <div class="md:hidden grid grid-cols-[1fr_1.3fr_1fr] items-center min-h-11">
            <span class="text-body-lg {cells[0].best ? 'text-accent font-bold' : 'text-text font-semibold'}">{cells[0].text}</span>
            <span class="text-center text-label text-text-muted">{row.label}</span>
            <span class="text-right text-body-lg {cells[1].best ? 'text-accent font-bold' : 'text-ink-2 font-medium'}">{cells[1].text}</span
            >
          </div>
          <div class="max-md:hidden">
            <StatDuelRow
              label={row.label}
              values={[cells[0].text, cells[1].text]}
              share={duelShare(row, statNumber(row, sides[0].values) ?? 0, statNumber(row, sides[1].values) ?? 0)}
              best={[cells[0].best, cells[1].best]}
            />
          </div>
        </div>
      {/each}
    {:else}
      {#each rows as row (row.key)}
        {@const cells = barCells(row, sides)}
        <div role="group" aria-label={row.label} class="flex flex-col gap-1.5 py-2.5 border-t border-line first:border-t-0 {hide(row)}">
          <span class="text-caption tracking-cta uppercase text-text-muted">{row.label}</span>
          <ul class="flex flex-col gap-1.5">
            {#each sides as s, i (s.index)}
              {@const cell = cells[i]}
              <li class="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-3">
                <span class="min-w-0 truncate text-label {s.me ? 'font-semibold text-text' : 'text-ink-2'}">{s.name}</span>
                {#if sides.length > 1}
                  <span aria-hidden="true" class="max-md:hidden h-[6px] rounded-[3px] bg-line overflow-hidden">
                    <span
                      class="block h-full rounded-[3px] {cell.best ? 'bg-accent' : 'bg-line-chip'}"
                      style:width="{Math.round(cell.fraction * 100)}%"
                    ></span>
                  </span>
                {:else}<span class="max-md:hidden"></span>{/if}
                <span
                  class="min-w-18 text-right whitespace-nowrap font-display font-bold text-[18px] {cell.best
                    ? 'text-accent'
                    : 'text-text-muted'}"
                  >{cell.text}{#if cell.best}<span class="sr-only"> (best)</span>{/if}</span
                >
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </section>
{/if}
