<script lang="ts">
  // One badge in the list (Achievements board): the badge with its progress ring, name, tier and
  // what it takes, the bar to the next tier, and on your own page the showcase button. `isNew`
  // marks a tier you have not looked at yet.
  import { Check, Plus } from '@lucide/svelte'
  import Badge from './Badge.svelte'
  import { CATEGORY_NAME, progressLine, statusLine, type Badge as BadgeData } from '$lib/achievements/view'

  type Showcase = { shown: boolean; full: boolean; toggle: () => void }
  let { badge, isNew = false, showcase = null }: { badge: BadgeData; isNew?: boolean; showcase?: Showcase | null } = $props()

  const line = $derived(progressLine(badge))
  const kind = $derived(badge.oneOff ? 'one-off' : `${badge.def.thresholds.length} tiers`)
</script>

<article aria-label={badge.def.name} class="card relative box-border flex gap-4 p-4 md:p-[18px] {badge.tier === 0 ? 'opacity-90' : ''}">
  {#if isNew}<span class="absolute right-3 top-3 size-2 rounded-full bg-accent" title="New" aria-label="New"></span>{/if}
  <Badge {badge} size={96} fraction={!badge.oneOff && badge.next !== null} />
  <div class="flex min-w-0 flex-1 flex-col gap-[6px]">
    <span class="text-caption label-caps text-text-dim">{CATEGORY_NAME[badge.def.category]} · {kind}</span>
    <h3 class="font-display font-bold text-player-name leading-none uppercase tracking-title {badge.tier === 0 ? 'text-text-muted' : ''}">
      {badge.def.name}
    </h3>
    <span class="text-small font-semibold {badge.tier === 0 ? 'text-text-dim' : 'text-accent'}">{statusLine(badge)}</span>
    <p class="text-small text-text-muted">{badge.def.description}</p>
    {#if line}
      <div class="mt-auto flex flex-col gap-1 pt-1">
        <span class="h-[6px] overflow-hidden rounded-full bg-surface-inset" aria-hidden="true"
          ><span class="block h-full bg-accent" style="width: {Math.round(badge.fraction * 100)}%"></span></span
        >
        <span class="flex justify-between text-caption text-text-muted tabular-nums"
          ><span>{line}</span><span>{Math.round(badge.fraction * 100)}%</span></span
        >
      </div>
    {:else if badge.oneOff && badge.tier > 0}
      <span class="mt-auto pt-1 text-caption text-text-dim">One-off</span>
    {/if}
    {#if showcase}
      <button
        type="button"
        disabled={badge.tier === 0 || (!showcase.shown && showcase.full)}
        onclick={showcase.toggle}
        class="mt-1 inline-flex items-center gap-[6px] self-start rounded-sm border px-3 py-[6px] text-small font-semibold
               {showcase.shown ? 'border-accent-line bg-accent-tint text-accent' : 'border-line-strong text-text'}
               cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if showcase.shown}<Check size={14} aria-hidden="true" />In showcase{:else if badge.tier === 0}Earn it to show it{:else if showcase.full}Showcase
          full{:else}<Plus size={14} aria-hidden="true" />Add to showcase{/if}
      </button>
    {/if}
  </div>
</article>
