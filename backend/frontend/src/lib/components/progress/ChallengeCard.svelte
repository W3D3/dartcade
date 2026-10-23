<script lang="ts">
  // A period's challenges (Progress board): the heading, when they reset, the three rows. On the
  // phone the page shows one period at a time, without the card (`bare`).
  import ChallengeRow from './ChallengeRow.svelte'
  import { resetsText, type ChallengeSet } from '$lib/progress/challenges'

  let {
    set,
    period,
    now,
    bare = false,
    fresh = () => false,
    onreroll,
    onclaim,
  }: {
    set: ChallengeSet
    period: 'daily' | 'weekly'
    now: Date
    bare?: boolean
    /** Finished while the page is open: it celebrates. */
    fresh?: (id: string) => boolean
    onreroll: (id: string) => void
    onclaim: (id: string, from: DOMRect) => Promise<void>
  } = $props()
</script>

<section
  aria-label={period === 'daily' ? 'Daily challenges' : 'Weekly challenges'}
  class="flex flex-col gap-[14px] box-border {bare ? '' : 'rounded-[14px] border border-line-2 bg-surface-2 p-[18px] md:p-[22px]'}"
>
  {#if !bare}
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-[12px] label-caps text-text-dim">{period === 'daily' ? 'Daily challenges' : 'Weekly challenges'}</span>
      <span class="flex items-center gap-[10px] text-[13px] text-text-muted">
        <span class="flex gap-[5px]" aria-label="{set.items.filter(c => c.claimed).length} of {set.items.length} claimed">
          {#each set.items as c (c.id)}<span class="w-[22px] h-2 rounded-full {c.claimed ? 'bg-accent' : 'bg-line'}"></span>{/each}
        </span>
        {resetsText(set, period, now)}
      </span>
    </div>
  {/if}
  <ul class="m-0 p-0 list-none flex flex-col gap-[10px]">
    {#each set.items as item (item.id)}
      <ChallengeRow {item} fresh={fresh(item.id)} onreroll={() => onreroll(item.id)} onclaim={(from: DOMRect) => onclaim(item.id, from)} />
    {/each}
  </ul>
  {#if bare}<span class="self-end text-[13px] text-text-muted">{resetsText(set, period, now)}</span>{/if}
</section>
