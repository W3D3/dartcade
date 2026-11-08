<script lang="ts">
  // The rating card on a ranked game's result (MM-Result board): the RP the game moved, a banner if
  // the stage changed, the new rating with the bar to the next stage. While the player is still
  // placing, the rating stays hidden and the card counts placement matches instead.
  import { ArrowRight, Swords } from '@lucide/svelte'
  import RankBadge from './RankBadge.svelte'
  import { PLACEMENT_MATCHES } from '$shared/ranked.js'
  import { TIER_TEXT, fmtRp } from '$lib/ranked/view'
  import type { RankedOutcome } from '$lib/ranked/result'

  let { outcome }: { outcome: RankedOutcome } = $props()
  const { rankBefore, rankAfter } = $derived(outcome)
</script>

<section
  aria-label="Rating, {outcome.mode}"
  class="box-border flex w-full max-w-[560px] flex-col gap-3 self-center rounded-popover border px-5 py-4 {outcome.won
    ? 'border-accent-line-strong bg-surface-picked'
    : 'border-line-2 bg-surface-panel'}"
>
  <div class="flex items-center gap-2">
    <Swords size={16} class="text-text-muted" aria-hidden="true" />
    <span class="label-caps text-[13px] text-text-muted">Rating · {outcome.mode}</span>
    {#if outcome.change}
      <span
        class="ml-auto inline-flex h-8 items-center rounded-sm px-3 font-mono text-[16px] font-semibold {outcome.won
          ? 'bg-accent text-accent-fg'
          : 'bg-live-soft text-live-text'}">{outcome.change}</span
      >
    {/if}
  </div>

  {#if outcome.placing}
    <div class="flex flex-col gap-2">
      <span class="font-display text-[34px] font-bold leading-none"
        >Placement {outcome.placing.played}<span class="text-text-dim"> / {PLACEMENT_MATCHES}</span></span
      >
      <span class="flex gap-[6px]" aria-hidden="true">
        {#each { length: PLACEMENT_MATCHES } as _, i (i)}
          <span class="h-[6px] flex-1 rounded-[3px] {i < outcome.placing.played ? 'bg-accent' : 'bg-line-chip'}"></span>
        {/each}
      </span>
      <span class="text-[13px] text-text-muted">
        {outcome.placing.played >= PLACEMENT_MATCHES - 1
          ? 'One more match and your rank is revealed.'
          : `${PLACEMENT_MATCHES - outcome.placing.played} more matches until your rank is revealed.`}
      </span>
    </div>
  {:else if outcome.after === null && rankAfter}
    <!-- The match that finished the placement: the rank is shown for the first time -->
    <div class="flex items-center gap-3 rounded-lg border border-warn-line bg-warn-panel px-4 py-3">
      <RankBadge rank={rankAfter} size={52} />
      <span class="flex flex-col">
        <span class="text-[11px] font-bold uppercase tracking-[0.12em]" style:color={TIER_TEXT[rankAfter.tier]}>Placed</span>
        <span class="font-display text-[30px] font-bold uppercase leading-none">{rankAfter.name}</span>
        <span class="text-[12px] text-text-muted">Your rank is yours now</span>
      </span>
    </div>
  {:else if outcome.after !== null}
    {#if outcome.moved && rankBefore && rankAfter}
      <div
        class="flex items-center gap-3 rounded-lg border px-4 py-3 {outcome.moved === 'promoted'
          ? 'border-warn-line bg-warn-panel'
          : 'border-line-2 bg-surface-inset'}"
      >
        <RankBadge rank={rankBefore} size={40} />
        <ArrowRight size={16} class="text-text-muted" aria-hidden="true" />
        <RankBadge rank={rankAfter} size={52} />
        <span class="flex flex-col">
          <span class="text-[11px] font-bold uppercase tracking-[0.12em]" style:color={TIER_TEXT[rankAfter.tier]}
            >{outcome.moved === 'promoted' ? 'Promoted' : 'Demoted'} · {rankAfter.tier !== rankBefore.tier ? 'new tier' : 'new stage'}</span
          >
          <span class="font-display text-[30px] font-bold uppercase leading-none">{rankAfter.name}</span>
          <span class="text-[12px] text-text-muted">{outcome.moved === 'promoted' ? 'Up' : 'Down'} from {rankBefore.name}</span>
        </span>
      </div>
    {/if}
    <div class="flex items-baseline gap-3">
      {#if outcome.before !== null}
        <span class="font-display text-[30px] font-bold text-text-dim line-through">{fmtRp(outcome.before)}</span>
        <ArrowRight size={18} class="self-center text-text-dim" aria-hidden="true" />
      {/if}
      <span class="font-display text-[56px] font-bold leading-[0.9]">{fmtRp(outcome.after)}</span>
      <span class="text-[15px] font-semibold text-text-dim">RP</span>
    </div>
    {#if outcome.progress}
      <div class="flex flex-col gap-[6px]">
        <span
          role="progressbar"
          aria-label="Progress to the next stage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={outcome.progress.pct}
          class="flex h-[6px] overflow-hidden rounded-[3px] bg-line"
          ><span class="bg-accent" style:width="{outcome.progress.pct}%"></span></span
        >
        <span class="text-[13px] text-text-muted">{outcome.progress.line}</span>
      </div>
    {/if}
  {/if}
</section>
