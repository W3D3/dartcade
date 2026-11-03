<script lang="ts">
  // Every visit of a leg as a row (Coach-Leg): # · Left · Darts · Scored · Then · Coach. Clicking a
  // row selects it.
  import type { ReviewVisit } from '$shared/coach'
  import { visitTiles } from '$lib/coach/dart'
  import DartTile from './DartTile.svelte'
  import GradePill from './GradePill.svelte'
  import GroupingPill from './GroupingPill.svelte'

  let { visits, selected, onselect }: { visits: ReviewVisit[]; selected: number | null; onselect: (n: number) => void } = $props()

  const COLUMNS = 'grid grid-cols-[34px_58px_240px_56px_52px_minmax(0,1fr)] items-center gap-3.5 px-3.5'
  const NUM = 'font-display text-[24px] font-bold text-right'
</script>

<div aria-hidden="true" class="{COLUMNS} pb-1 text-[12px] font-semibold label-caps text-text-dim">
  <span>#</span><span class="text-right">Left</span><span>Darts</span><span class="text-right">Scored</span><span class="text-right"
    >Then</span
  ><span>Coach</span>
</div>
<ul class="m-0 flex list-none flex-col p-0">
  {#each visits as v (v.n)}
    {@const sel = v.n === selected}
    <li>
      <button
        type="button"
        aria-pressed={sel}
        onclick={() => onselect(v.n)}
        class="{COLUMNS} w-full cursor-pointer rounded-[12px] border py-3 text-left font-[inherit] text-text {sel
          ? 'border-checkout-line bg-card-active'
          : 'border-transparent bg-transparent hover:bg-surface-drop'}"
      >
        <span class="font-display text-[20px] font-bold text-text-dim"><span class="sr-only">Visit </span>{v.n}</span>
        <span class={NUM}><span class="sr-only">Left </span>{v.left}</span>
        <span class="flex items-start gap-1.5">
          {#each visitTiles(v) as t, i (i)}<DartTile tile={t} />{/each}
        </span>
        <span class={NUM}><span class="sr-only">Scored </span>{v.scored}</span>
        <span class="{NUM} text-text-muted"><span class="sr-only">Then </span>{v.then}</span>
        <span class="flex min-w-0 flex-col gap-1.5">
          <span class="flex flex-wrap items-center gap-2">
            <GradePill grade={v.grade} />
            <span class="text-[12.5px] capitalize text-text-dim">{v.tag}</span>
            <GroupingPill grouping={v.grouping} />
          </span>
          <span class="text-[13.5px] leading-[1.45] {v.tip ? 'text-ice' : 'text-ink-2'}">{v.text}</span>
        </span>
      </button>
    </li>
  {/each}
</ul>
