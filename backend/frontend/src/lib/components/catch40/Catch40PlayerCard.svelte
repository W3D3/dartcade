<!--
  A Catch 40 player's card: the shared practice card with the hint, and the running total.
-->
<script lang="ts">
  import type { Who } from '$lib/face'
  import type { Catch40Game } from '$lib/api/game-ws'
  import PracticeCard from '$lib/components/practice/PracticeCard.svelte'
  import { catch40Banner, catch40Pips, DARTS_PER_TARGET } from '$lib/catch40/view'
  import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'

  let {
    game,
    seat,
    who,
    active,
    visitDarts = 0,
    variant = 'solo',
    portrait = false,
    checkout,
  }: {
    game: Catch40Game
    seat: number
    who: Who
    /** The thrower: the lime-bordered card. */
    active: boolean
    /** Darts in the open visit; 0 for anyone not throwing. */
    visitDarts?: number
    variant?: 'solo' | 'side' | 'phone'
    portrait?: boolean
    checkout?: CheckoutPrefs
  } = $props()

  const s = $derived(game.seats[seat])
  const used = $derived(s.darts + visitDarts)
  // The route fits in what's left of this visit and of the target's six darts
  const route = $derived(checkoutHint(s.left, 'double', Math.min(3 - visitDarts, DARTS_PER_TARGET - used), checkout))
  const caption = 'text-caption font-semibold label-caps text-text-dim'
</script>

{#snippet total()}
  <span class="flex items-baseline gap-[6px]">
    <span class={caption}>Total</span>
    <span class="font-display font-bold text-wordmark leading-none">{s.total}</span>
  </span>
{/snippet}

<PracticeCard
  {who}
  {active}
  {variant}
  {portrait}
  target={s.target}
  left={s.left}
  {used}
  maxDarts={DARTS_PER_TARGET}
  pips={catch40Pips(game, seat, visitDarts)}
  banner={visitDarts === 0 ? catch40Banner(game, seat) : null}
  label="Target {s.target}, {s.left} left, {s.total} points"
>
  {#snippet hint()}
    {#if s.left === 0}Checked out in {used} {used === 1 ? 'dart' : 'darts'}.{:else if route}Hit <strong class="text-accent"
        >{route.join(' then ')}</strong
      >
      to make it.{:else}Score {s.left} to make it.{/if}
  {/snippet}
  {#snippet phoneLead()}{@render total()}{/snippet}
  {#snippet footer()}<div class="mt-auto">{@render total()}</div>{/snippet}
</PracticeCard>
