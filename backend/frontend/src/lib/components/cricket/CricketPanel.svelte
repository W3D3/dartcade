<!--
  A Cricket player (or team) card: name, legs, the pill, points and MPR. Sizes per the artboards:
  `lg` the thrower's card in a duel (Cricket-Duel), `md` the other player's, `head` a column head
  of the party table (Cricket-Party), `sm` the phone strip (Mobile-Cricket). `compact` duel cards
  (keypad, short screens) drop the avatar, keep the pill by the name and shrink the points, so the
  column has room left for the board or keypad. Points roll up like
  X01's score; in cut-throat a gain is bad news and rolls in red.
-->
<script lang="ts">
  import type { CricketGame } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import LegPips from '$lib/components/LegPips.svelte'
  import PlayerPill from '$lib/components/PlayerPill.svelte'
  import RollingNumber from '$lib/components/RollingNumber.svelte'
  import { cricketMpr, legNumber, type CricketSide } from '$lib/cricket/view'
  import { playerCard } from '$lib/playerCard'

  let {
    game,
    side,
    active,
    upNext,
    size,
    compact = false,
  }: {
    game: CricketGame
    side: CricketSide
    active: boolean
    upNext: boolean
    size: 'lg' | 'md' | 'head' | 'sm'
    compact?: boolean
  } = $props()

  const SIZES = {
    lg: { card: 'px-[22px] py-4 xl:py-5 rounded-[18px] gap-3', name: 'text-[22px]', points: 'text-[clamp(56px,11vh,104px)]' },
    md: { card: 'px-[22px] py-4 rounded-[18px] gap-3', name: 'text-[22px]', points: 'text-[clamp(40px,7vh,64px)]' },
    head: { card: 'p-3 rounded-[14px] gap-2', name: 'text-[17px] xl:text-[20px]', points: 'text-[clamp(40px,6vh,56px)]' },
    sm: { card: 'px-3 pt-2 pb-[10px] rounded-[12px] gap-1', name: 'text-[15px]', points: 'text-[40px]' },
  }
  const COMPACT = { card: 'px-4 py-3 rounded-[16px] gap-2', name: 'text-[19px]', points: 'text-[44px]' }
  const S = $derived(compact ? COMPACT : SIZES[size])
  const duel = $derived((size === 'lg' || size === 'md') && !compact)
  const points = $derived(game.points[side.seat])
  const state = $derived(active ? 'throwing' : upNext ? 'up next' : null)
</script>

<section
  aria-label="{side.name}, {state ? `${state}, ` : ''}{points} points"
  class="min-w-0 box-border flex flex-col {S.card} {playerCard(active)}"
>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
    {#if duel}<Avatar name={side.name} tone={active ? 'accent' : 'default'} size={40} />{/if}
    <span class="font-semibold truncate {S.name} {active ? 'text-text' : 'text-ink-2'}">{side.name}</span>
    {#if compact && state}<PlayerPill kind={active ? 'throwing' : 'up-next'} small />{/if}
    <span class="ml-auto"><LegPips total={game.firstTo} won={game.legs[side.seat]} {active} /></span>
  </div>
  {#if side.members}<span class="text-[12px] text-text-muted truncate">{side.members}</span>{/if}
  {#if compact}
    <!-- the pill sits by the name -->
  {:else if size === 'sm'}
    {#if state}<span class="text-[11px] font-bold uppercase tracking-[0.08em] {active ? 'text-accent' : 'text-text-dim'}">{state}</span
      >{/if}
  {:else if active}<PlayerPill kind="throwing" small={size !== 'lg'} />{:else if upNext}<PlayerPill
      kind="up-next"
      small={size !== 'lg'}
    />{:else if size === 'head'}<span class="h-[26px]"></span>{/if}
  <div class="flex items-end justify-between gap-2">
    <span class="font-display font-bold leading-[0.82] tracking-[-0.02em] tabular-nums {S.points} {active ? 'text-text' : 'text-ink-3'}"
      ><RollingNumber value={points} normal="up" reset={legNumber(game)} gain={game.config.mode === 'cutthroat' ? 'bad' : 'plain'} /></span
    >
    <span class="text-[13px] text-text-muted whitespace-nowrap"
      >MPR <strong class="font-semibold {active ? 'text-text' : 'text-ink-2'}">{cricketMpr(game, side.seats)}</strong></span
    >
  </div>
</section>
