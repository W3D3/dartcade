<script lang="ts">
  // Duel and teams: both sides facing each other around the headline (3–1), the Winner tag on
  // the winner. Teams list their players under the name. Phones: both sides in one row and the
  // headline below them, so a wide score ("21–28") never squeezes the names away.
  import Avatar from '$lib/components/Avatar.svelte'
  import ProfilePopover from '$lib/components/progress/ProfilePopover.svelte'
  import type { GameDetail } from '$lib/api'
  import { headline, type DetailSide } from '$lib/details/page'

  let { detail, sides }: { detail: GameDetail; sides: DetailSide[] } = $props()
  const head = $derived(headline(detail, sides))
  const solo = $derived(sides.length === 1)
  // Smaller on phones, where it sits in a narrow column under the name
  const PILL =
    'h-[20px] md:h-[26px] px-[8px] md:px-[10px] inline-flex items-center rounded-full text-[10px] md:text-[12px] font-bold tracking-[0.08em] uppercase'
</script>

{#snippet side(s: DetailSide, align: 'start' | 'end')}
  <div class="flex flex-col gap-[10px] min-w-0 {align === 'end' ? 'items-end text-right' : 'items-start'}">
    <ProfilePopover userId={s.userId} name={s.name}>
      <!-- Phones: the avatar above the name, so the name gets the column's whole width -->
      <span
        class="flex flex-col sm:flex-row sm:items-center gap-[6px] sm:gap-[10px] min-w-0 max-w-full {align === 'end'
          ? 'items-end sm:flex-row-reverse'
          : 'items-start'}"
      >
        <Avatar
          name={s.name}
          size={36}
          guest={s.guest}
          bot={s.bot}
          avatar={s.avatar}
          userId={s.userId}
          tone={s.me ? 'accent' : 'default'}
        />
        <span class="max-w-full text-[18px] md:text-[20px] font-semibold truncate {s.placement === 1 ? 'text-text' : 'text-ink-2'}"
          >{s.name}</span
        >
      </span>
    </ProfilePopover>
    {#if s.members.length > 1}
      <span class="flex flex-wrap gap-x-[6px] max-w-full wrap-anywhere text-[13px] text-text-muted {align === 'end' ? 'justify-end' : ''}">
        {#each s.members as m, i (i)}
          {#if i > 0}<span aria-hidden="true">·</span>{/if}
          <ProfilePopover userId={m.userId} name={m.name}>{m.name}</ProfilePopover>
        {/each}
      </span>
    {/if}
    {#if s.forfeited}
      <span class="{PILL} border border-danger-line text-danger-text">Gave up</span>
    {:else if s.placement === 1 && !solo}
      <span class="{PILL} bg-accent text-accent-fg">Winner</span>
    {/if}
  </div>
{/snippet}

<section
  aria-label="Result"
  class="grid {solo
    ? 'grid-cols-[1fr_auto]'
    : 'grid-cols-2 md:grid-cols-[1fr_auto_1fr] max-md:items-start'} items-center gap-4 px-5 md:px-7 py-5 md:py-6 rounded-[18px] bg-surface-active border-2 border-accent"
>
  {@render side(sides[0], 'start')}
  <div class="flex flex-col items-center gap-2 {solo ? '' : 'max-md:order-last max-md:col-span-2'}">
    {#if head.big}<span class="font-display font-bold {solo ? 'text-[72px]' : 'text-[56px]'} md:text-[104px] leading-[0.85]"
        >{head.big}</span
      >{/if}
    {#if head.caption}<span class="text-[12px] label-caps text-text-muted text-center">{head.caption}</span>{/if}
  </div>
  {#if sides[1]}{@render side(sides[1], 'end')}{/if}
</section>
