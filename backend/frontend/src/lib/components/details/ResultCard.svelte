<script lang="ts">
  // Duel and teams: both sides facing each other around the headline (3–1), the Winner tag on
  // the winner. Teams list their players under the name.
  import Avatar from '$lib/components/Avatar.svelte'
  import type { GameDetail } from '$lib/api'
  import { headline, type DetailSide } from '$lib/details/page'

  let { detail, sides }: { detail: GameDetail; sides: DetailSide[] } = $props()
  const head = $derived(headline(detail, sides))
  const solo = $derived(sides.length === 1)
</script>

{#snippet side(s: DetailSide, align: 'start' | 'end')}
  <div class="flex flex-col gap-[10px] min-w-0 {align === 'end' ? 'items-end text-right' : 'items-start'}">
    <span class="flex items-center gap-[10px] min-w-0 {align === 'end' ? 'flex-row-reverse' : ''}">
      <Avatar name={s.name} size={36} guest={s.guest} tone={s.me ? 'accent' : 'default'} />
      <span class="text-[18px] md:text-[20px] font-semibold truncate {s.placement === 1 ? 'text-text' : 'text-ink-2'}">{s.name}</span>
    </span>
    {#if s.members.length > 1}<span class="text-[13px] text-text-muted">{s.members.join(' · ')}</span>{/if}
    {#if s.forfeited}
      <span
        class="h-[26px] px-[10px] inline-flex items-center rounded-full border border-danger-line text-danger-text text-[12px] font-bold tracking-[0.08em] uppercase"
        >Gave up</span
      >
    {:else if s.placement === 1 && !solo}
      <span
        class="h-[26px] px-[10px] inline-flex items-center rounded-full bg-accent text-accent-fg text-[12px] font-bold tracking-[0.08em] uppercase"
        >Winner</span
      >
    {/if}
  </div>
{/snippet}

<section
  aria-label="Result"
  class="grid {solo
    ? 'grid-cols-[1fr_auto]'
    : 'grid-cols-[1fr_auto_1fr]'} items-center gap-4 px-5 md:px-7 py-5 md:py-6 rounded-[18px] bg-surface-active border-2 border-accent"
>
  {@render side(sides[0], 'start')}
  <div class="flex flex-col items-center gap-2">
    {#if head.big}<span class="font-display font-bold text-[72px] md:text-[104px] leading-[0.85]">{head.big}</span>{/if}
    {#if head.caption}<span class="text-[12px] label-caps text-text-muted text-center">{head.caption}</span>{/if}
  </div>
  {#if sides[1]}{@render side(sides[1], 'end')}{/if}
</section>
