<script lang="ts">
  // Every visit of the leg, side by side: the score badge (lime ring at 100+, inverted on 180),
  // the darts, and the points left, crossed out once passed; "Out" on the checkout. In a team
  // game each cell names who threw.
  import type { ChalkRow, Side } from '$lib/details/x01'

  let {
    rows,
    sides,
    showThrower = false,
    nameOf,
  }: { rows: ChalkRow[]; sides: Side[]; showThrower?: boolean; nameOf: (seat: number) => string } = $props()
  const cols = $derived(`40px repeat(${sides.length}, minmax(0, 1fr))`)
</script>

<div role="table" aria-label="Visits in this leg, dart by dart" class="flex flex-col overflow-x-auto">
  <div
    role="row"
    class="grid gap-[10px] h-7 items-center border-b border-line-2 text-[12px] label-caps text-text-dim"
    style:grid-template-columns={cols}
  >
    <span role="columnheader">#</span>
    {#each sides as s (s.key)}<span role="columnheader" class="truncate">{s.name}</span>{/each}
  </div>
  {#each rows as row (row.n)}
    <div role="row" class="grid gap-[10px] min-h-[38px] items-center border-b border-line" style:grid-template-columns={cols}>
      <span role="cell" class="font-mono text-[13px] text-ink-faint">{row.n}</span>
      {#each row.cells as c, i (i)}
        {#if c}
          <span
            role="cell"
            aria-label="{showThrower ? `${nameOf(c.seat)}: ` : ''}{c.darts.join(', ')} = {c.scored}{c.out
              ? ', checkout'
              : `, ${c.left} left`}{c.bust ? ', bust' : ''}"
            class="flex items-center gap-2 min-w-0 px-2 py-1 rounded-[8px] {c.tier === 'max' ? 'bg-accent text-accent-fg' : ''}"
          >
            <span
              class="w-[52px] h-7 shrink-0 box-border flex items-center justify-center rounded-[7px] font-display font-bold text-[20px]
                     {c.tier === 'max'
                ? 'bg-bg text-accent'
                : c.tier === 'ton'
                  ? 'border-[1.5px] border-accent bg-surface-active text-accent'
                  : ''}">{c.bust ? 'Bust' : c.scored}</span
            >
            {#if showThrower}<span class="text-[12px] text-text-muted truncate">{nameOf(c.seat)}</span>{/if}
            <span class="hidden sm:flex gap-1" aria-hidden="true">
              {#each c.darts as d, k (k)}
                <span
                  class="w-10 h-[22px] flex items-center justify-center rounded-[5px] font-display text-[14px]
                         {c.tier === 'max' ? 'bg-[#a9cf42] text-accent-fg' : 'bg-surface-chip'} {d.startsWith('T') || d === 'Bull'
                    ? 'font-bold'
                    : 'font-medium'}">{d}</span
                >
              {/each}
            </span>
            <span
              class="ml-auto font-display font-semibold text-[17px] {c.out
                ? 'text-accent'
                : c.crossed
                  ? 'line-through text-text-dim'
                  : 'text-text'}">{c.out ? 'Out' : c.left}</span
            >
          </span>
        {:else}
          <span role="cell"></span>
        {/if}
      {/each}
    </div>
  {/each}
</div>
