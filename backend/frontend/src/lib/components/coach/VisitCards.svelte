<script lang="ts">
  // Every visit of a leg as a stacked card (Coach-Phone-Leg). Tapping a card selects it and opens
  // its detail (`detail`, the board) under it; tapping it again closes it.
  import type { Snippet } from 'svelte'
  import type { ReviewVisit } from '$shared/coach'
  import { visitTiles } from '$lib/coach/dart'
  import DartTile from './DartTile.svelte'
  import GradePill from './GradePill.svelte'
  import GroupingPill from './GroupingPill.svelte'

  let {
    visits,
    selected,
    onselect,
    detail,
  }: { visits: ReviewVisit[]; selected: number | null; onselect: (n: number) => void; detail: Snippet<[ReviewVisit]> } = $props()

  // The parent keys this on the leg, so a new leg starts closed
  let expanded = $state(false)
  const buttons: Record<number, HTMLButtonElement | undefined> = {}

  function tap(n: number) {
    expanded = n === selected ? !expanded : true
    onselect(n)
  }

  // ← / → in the open detail move it to another card and remove the button that had focus: focus
  // the newly selected card instead
  $effect(() => {
    if (!expanded || selected === null) return
    const lost = document.activeElement === null || document.activeElement === document.body
    if (lost) buttons[selected]?.focus()
  })
</script>

<ul class="flex flex-col gap-2">
  {#each visits as v (v.n)}
    {@const sel = v.n === selected}
    <li
      class="flex flex-col gap-3 rounded-[12px] border {sel
        ? 'border-checkout-line bg-card-active'
        : 'border-surface-paused bg-surface-panel'}"
    >
      <button
        type="button"
        bind:this={buttons[v.n]}
        aria-expanded={sel && expanded}
        onclick={() => tap(v.n)}
        class="flex w-full cursor-pointer flex-col gap-2 border-0 p-3 text-left text-text"
      >
        <span class="flex w-full items-center gap-2.5">
          <span class="w-[18px] font-display text-[18px] font-bold text-text-dim"><span class="sr-only">Visit </span>{v.n}</span>
          <span class="flex items-start gap-[5px]">
            {#each visitTiles(v) as t, i (i)}<DartTile tile={t} />{/each}
          </span>
          <span class="ml-auto flex flex-col text-right">
            <span class="font-display text-[20px] font-bold leading-none">{v.scored}</span>
            <span class="text-[11px] text-text-dim">{v.left} → {v.then}</span>
          </span>
        </span>
        <span class="flex flex-wrap items-center gap-2">
          <GradePill grade={v.grade} />
          <span class="text-[12px] capitalize text-text-dim">{v.tags.join(' + ')}</span>
          <GroupingPill grouping={v.grouping} />
        </span>
        <span class="text-[13px] leading-[1.45] {v.tip ? 'text-ice' : 'text-ink-2'}">{v.text}</span>
      </button>
      {#if sel && expanded}
        <div class="px-3 pb-3">{@render detail(v)}</div>
      {/if}
    </li>
  {/each}
</ul>
