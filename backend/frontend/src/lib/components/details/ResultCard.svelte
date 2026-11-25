<script lang="ts">
  // The result hero, at the top of the page. Duel and teams: both sides facing each other around
  // the score (3–1), the Winner tag on the winner; teams list their players under the name.
  // Three or more: a card per player in finishing order, each with its place and score. Names wrap
  // instead of being cut, so a long one costs a line, never its end. Phones: both sides in one row
  // and the score below them, so a wide score ("21–28") never squeezes the names away.
  import Avatar from '$lib/components/Avatar.svelte'
  import ProfilePopover from '$lib/components/progress/ProfilePopover.svelte'
  import type { GameDetail } from '$lib/api'
  import { ordinal } from '$lib/fmt'
  import { headline, type DetailSide } from '$lib/details/page'

  let { detail, sides }: { detail: GameDetail; sides: DetailSide[] } = $props()
  const head = $derived(headline(detail, sides))
  const solo = $derived(sides.length === 1)
  const party = $derived(sides.length >= 3)
  const placed = $derived(sides.map((s, i) => ({ s, score: head.scores[i] ?? '' })).sort((a, b) => a.s.placement - b.s.placement))
  // Smaller on phones, where it sits in a narrow column under the name
  const PILL =
    'h-[20px] md:h-[26px] px-[8px] md:px-[10px] inline-flex items-center rounded-full text-[10px] md:text-caption font-bold tracking-[0.08em] uppercase'
</script>

{#snippet tag(s: DetailSide)}
  {#if s.forfeited}
    <span class="{PILL} border border-danger-line text-danger-text">Gave up</span>
  {:else if s.placement === 1 && sides.length > 1}
    <span class="{PILL} bg-accent text-accent-fg">Winner</span>
  {/if}
{/snippet}

{#snippet side(s: DetailSide, align: 'start' | 'end' | 'center')}
  <div
    class="flex flex-col gap-[10px] min-w-0 {align === 'end'
      ? 'items-end text-right'
      : align === 'center'
        ? 'items-center text-center'
        : 'items-start'}"
  >
    <ProfilePopover userId={s.userId} name={s.name}>
      <!-- The avatar above the name, so the name gets the column's whole width beside a wide score -->
      <span
        class="flex flex-col gap-2 min-w-0 max-w-full {align === 'end' ? 'items-end' : align === 'center' ? 'items-center' : 'items-start'}"
      >
        <Avatar name={s.name} size={party ? 48 : 56} guest={s.guest} face={s} tone={s.me ? 'accent' : 'default'} />
        <span
          class="max-w-full wrap-anywhere text-[19px] md:text-[24px] leading-tight font-semibold {s.placement === 1
            ? 'text-text'
            : 'text-ink-2'}">{s.name}</span
        >
      </span>
    </ProfilePopover>
    {#if s.members.length > 1}
      <span
        class="flex flex-wrap gap-x-[6px] max-w-full wrap-anywhere text-small text-text-muted {align === 'end'
          ? 'justify-end'
          : align === 'center'
            ? 'justify-center'
            : ''}"
      >
        {#each s.members as m, i (i)}
          {#if i > 0}<span aria-hidden="true">·</span>{/if}
          <ProfilePopover userId={m.userId} name={m.name}>{m.name}</ProfilePopover>
        {/each}
      </span>
    {/if}
    {@render tag(s)}
  </div>
{/snippet}

{#if party}
  <section aria-label="Result" class="flex flex-col gap-3 p-4 md:p-5 rounded-panel bg-surface-active border-2 border-accent">
    <ol class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-3">
      {#each placed as { s, score } (s.index)}
        <li
          class="flex flex-col items-center gap-2 min-w-0 p-4 rounded-lg border {s.placement === 1
            ? 'border-accent bg-surface-1'
            : 'border-line bg-surface-1'}"
        >
          <span class="font-display font-bold text-[20px] {s.placement === 1 ? 'text-accent' : 'text-text-muted'}"
            >{ordinal(s.placement)}</span
          >
          {@render side(s, 'center')}
          {#if score}<span class="font-display font-bold text-[40px] leading-none">{score}</span>{/if}
        </li>
      {/each}
    </ol>
    {#if head.caption}<span class="text-caption label-caps text-text-muted text-center">{head.caption}</span>{/if}
  </section>
{:else}
  <section
    aria-label="Result"
    class="grid {solo
      ? 'grid-cols-[1fr_auto]'
      : 'grid-cols-2 md:grid-cols-[1fr_auto_1fr] max-md:items-start'} items-center gap-4 md:gap-8 p-5 md:px-10 md:py-8 rounded-panel bg-surface-active border-2 border-accent"
  >
    {@render side(sides[0], 'start')}
    <div class="flex flex-col items-center gap-2 {solo ? '' : 'max-md:order-last max-md:col-span-2'}">
      {#if head.big}<span class="font-display font-bold {solo ? 'text-[72px]' : 'text-[56px]'} md:text-7xl xl:text-hero leading-[0.85]"
          >{head.big}</span
        >{/if}
      {#if head.caption}<!-- w-0 min-w-full: the caption wraps to the score's width instead of widening the middle column -->
        <span class="w-0 min-w-full text-caption label-caps text-text-muted text-center">{head.caption}</span>{/if}
    </div>
    {#if sides[1]}{@render side(sides[1], 'end')}{/if}
  </section>
{/if}
