<!--
  A 121 player's card: the shared practice card with the route hint (or where a miss leads), and
  the try's visits so far as a table on the desktop card.
-->
<script lang="ts">
  import type { Who } from '$lib/face'
  import type { P121Game } from '$lib/api/game-ws'
  import PracticeCard from '$lib/components/practice/PracticeCard.svelte'
  import { plural } from '$lib/fmt'
  import { p121Banner, p121Hint, p121Pips } from '$lib/p121/view'
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
    game: P121Game
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
  // The route fits in what's left of this visit and of the try
  const route = $derived(checkoutHint(s.left, game.cfg.outMode, Math.min(3 - visitDarts, game.cfg.dartsPerTry - used), checkout))
  const hintText = $derived(s.left === 0 ? `Checked out in ${plural(used, 'dart')}.` : p121Hint(game, seat, route))
  // The try's visits: each committed one, then the open one while it has darts
  const rows = $derived.by(() => {
    let left = s.target
    const out = s.visits.map(v => ({ scored: String(v), left: (left -= v), open: false }))
    if (active && visitDarts > 0)
      out.push({ scored: `${game.visitStartLeft - s.left}${game.visitLocked ? '' : '…'}`, left: s.left, open: true })
    return out
  })
</script>

<PracticeCard
  {who}
  {active}
  {variant}
  {portrait}
  target={s.target}
  left={s.left}
  {used}
  maxDarts={game.cfg.dartsPerTry}
  pips={p121Pips(game, seat, visitDarts)}
  banner={visitDarts === 0 ? p121Banner(game, seat) : null}
  label="Target {s.target}, {s.left} left"
>
  {#snippet hint()}
    {#if route && s.left > 0}Hit <strong class="text-accent">{route.join(' then ')}</strong> to make it and move up to {s.target +
        1}.{:else}{hintText}{/if}
  {/snippet}
  {#snippet phoneLead()}<span class="text-[12px] font-semibold label-caps text-text-dim">Left</span>{/snippet}
  {#snippet footer()}
    {#if rows.length}
      <div class="mt-auto p-[10px] rounded-lg bg-surface-1 border border-line">
        <div class="grid grid-cols-2 gap-5 px-3 pb-[6px] text-[11px] font-semibold label-caps text-text-dim">
          <span class="text-right">Scored</span><span>Left</span>
        </div>
        {#each rows as r, i (i)}
          <div
            class="grid grid-cols-2 gap-5 px-3 py-[6px] rounded-sm font-display font-bold text-[30px] {r.open ? 'bg-surface-active' : ''}"
          >
            <span class="text-right {r.open ? 'text-accent' : 'text-text'}">{r.scored}</span>
            <span class={r.open ? 'text-text' : 'text-text-dim'}>{r.left}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/snippet}
</PracticeCard>
