<script lang="ts">
  // "Your match is on" (Tournament-Live): the stage and opponent, the leg score, who is throwing,
  // and Back to the match; before the game starts, that it starts once you are both there.
  import { ArrowRight } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button'
  import { hrefs } from '$lib/routes'
  import { faceOf, yourMatchLine, type LiveEntry, type YourMatch } from '$lib/tournaments/live'

  let { y, you }: { y: YourMatch; you: LiveEntry | null } = $props()

  const game = $derived(y.match.game)
</script>

<section
  class="flex flex-col gap-4 rounded-panel border border-live/40 bg-linear-to-r from-live-soft to-surface-panel to-70% px-5 py-4 md:flex-row md:items-center md:gap-[22px] md:px-6 md:py-5"
  aria-label="Your match"
>
  <span class="flex min-w-0 flex-col gap-1">
    <span class="label-caps text-caption font-bold text-live-text">{game ? 'Your match is on' : 'Your match is next'}</span>
    <span class="type-section-title font-bold leading-none md:text-checkout">{y.stage} vs {y.opponent?.name ?? 'TBD'}</span>
    <span class="text-small text-ink-2">{yourMatchLine(y)}</span>
  </span>
  {#if game}
    <span class="flex items-center gap-2.5 md:ml-auto">
      <Avatar name={you?.name ?? 'You'} face={faceOf(you)} tone="accent" size={44} />
      <span class="type-checkout font-bold">{y.match.legs[y.side]} – {y.match.legs[1 - y.side]}</span>
      <Avatar name={y.opponent?.name ?? '?'} face={faceOf(y.opponent)} size={44} />
    </span>
    <Button variant="accent" href={hrefs.session(game.sessionId)} class="h-[50px] px-[22px] md:ml-4"
      >Back to the match<ArrowRight size={18} /></Button
    >
  {/if}
</section>
