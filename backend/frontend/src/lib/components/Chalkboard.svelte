<script lang="ts">
  // Scored | Left for each visit of the leg. Old "left" values are struck through;
  // the thrower's running visit is the highlighted last row. A team's chalkboard marks each
  // visit with the initial of the player who threw it.
  import type { Visit } from '$lib/visitHistory.js'

  let {
    visits,
    current,
    active,
    marks = null,
    currentMark = null,
    label = 'Chalkboard',
  }: {
    visits: Visit[]
    current: { scored: number; left: number; bust: boolean } | null
    active: boolean
    /** One per visit: who threw it (teams). */
    marks?: string[] | null
    currentMark?: string | null
    label?: string
  } = $props()
</script>

{#snippet mark(text: string | null | undefined, highlight: boolean)}
  {#if text}<span class="font-sans text-[13px] font-semibold {highlight ? 'text-accent' : 'text-text-dim'}">{text}</span>{/if}
{/snippet}

<div
  class="relative mt-auto min-h-[120px] flex-1 max-h-[340px] flex flex-col box-border px-3 py-[10px] rounded-[12px] border border-line-2
            {active ? 'bg-surface-chip' : 'bg-surface-inset'}"
  role="region"
  aria-label={label}
>
  <span class="absolute left-1/2 top-[10px] bottom-[10px] w-px bg-line-chip" aria-hidden="true"></span>
  <div class="grid grid-cols-2 h-7 shrink-0 items-center text-[13px] label-caps text-text-dim">
    <span class="text-right pr-[14px]">Scored</span><span class="pl-[14px]">Left</span>
  </div>
  <!-- Newest at the bottom; older rows scroll out of view at the top -->
  <div class="flex-1 min-h-0 flex flex-col justify-end overflow-hidden">
    {#each visits as v, i (i)}
      {@const latest = !current && i === visits.length - 1}
      <div class="grid grid-cols-2 h-11 shrink-0 items-center font-display text-[34px] leading-none tabular-nums">
        <span
          class="pr-[14px] flex items-baseline justify-end gap-[10px] font-bold {v.bust
            ? 'text-danger-text'
            : active
              ? 'text-ink-soft'
              : 'text-ink-3'}"
        >
          {@render mark(marks?.at(i), false)}<span>{v.bust ? 'Bust' : v.scored}</span>
        </span>
        <span class="pl-[14px] {latest && !active ? 'font-bold text-text' : 'font-semibold text-text-dim line-through'}">{v.left}</span>
      </div>
    {/each}
    {#if current}
      <div
        class="grid grid-cols-2 h-[46px] shrink-0 items-center rounded-[8px] bg-surface-key font-display font-bold text-[34px] leading-none tabular-nums"
      >
        <span class="pr-[14px] flex items-baseline justify-end gap-[10px] {current.bust ? 'text-danger-text' : 'text-accent'}">
          {@render mark(currentMark, true)}<span>{current.bust ? 'Bust' : `${current.scored}…`}</span>
        </span>
        <span class="pl-[14px] text-text">{current.left}</span>
      </div>
    {/if}
  </div>
</div>
