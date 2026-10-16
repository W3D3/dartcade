<!--
  A 121 player's card (P121-Game, P121-Phone): the target, the big number left, the try's darts as
  pips in threes, the hint or the made/missed banner, and the try's visits so far. 'solo' is the
  400 px desktop card, 'side' a duel card, 'phone' the compact card on top of the phone screen.
-->
<script lang="ts">
  import { Check, X } from '@lucide/svelte'
  import type { P121Game } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import { plural } from '$lib/fmt'
  import { playerCard } from '$lib/playerCard'
  import { p121Banner, p121Hint, p121Pips } from '$lib/p121/view'
  import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'

  let {
    game,
    seat,
    name,
    active,
    visitDarts = 0,
    variant = 'solo',
    checkout,
  }: {
    game: P121Game
    seat: number
    name: string
    /** The thrower: the lime-bordered card. */
    active: boolean
    /** Darts in the open visit; 0 for anyone not throwing. */
    visitDarts?: number
    variant?: 'solo' | 'side' | 'phone'
    checkout?: CheckoutPrefs
  } = $props()

  const s = $derived(game.seats[seat])
  const used = $derived(s.darts + visitDarts)
  const pips = $derived(p121Pips(game, seat, visitDarts))
  const banner = $derived(p121Banner(game, seat))
  // The route fits in what's left of this visit and of the try
  const route = $derived(checkoutHint(s.left, game.cfg.outMode, Math.min(3 - visitDarts, game.cfg.dartsPerTry - used), checkout))
  const hint = $derived(s.left === 0 ? `Checked out in ${plural(used, 'dart')}.` : p121Hint(game, seat, route))
  // The try's visits: each committed one, then the open one while it has darts
  const rows = $derived.by(() => {
    let left = s.target
    const out = s.visits.map(v => ({ scored: String(v), left: (left -= v), open: false }))
    if (active && visitDarts > 0)
      out.push({ scored: `${game.visitStartLeft - s.left}${game.visitLocked ? '' : '…'}`, left: s.left, open: true })
    return out
  })
  const phone = $derived(variant === 'phone')
  const label = 'text-[12px] font-semibold label-caps text-text-dim'
</script>

{#snippet pipRow(size: string)}
  <div role="img" aria-label="{used} of {game.cfg.dartsPerTry} darts used" class="flex gap-[21px]">
    {#each pips as group, g (g)}
      <span class="flex gap-[7px]">
        {#each group as p, i (i)}
          <span
            class="{size} rounded-full box-border {p === 'used'
              ? 'bg-line-strong'
              : p === 'current'
                ? 'bg-accent shadow-[0_0_10px_rgba(198,242,78,.5)]'
                : 'border-2 border-line-chip'}"
          ></span>
        {/each}
      </span>
    {/each}
  </div>
{/snippet}

{#snippet hintLine()}
  {#if banner && visitDarts === 0}
    <span
      role="status"
      class="self-start inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] border {banner.kind === 'made'
        ? 'bg-accent-tint border-accent-line text-accent'
        : 'bg-live-soft border-danger-line text-danger-text'}"
    >
      {#if banner.kind === 'made'}<Check size={14} strokeWidth={3} />{:else}<X size={14} strokeWidth={3} class="text-live" />{/if}
      {banner.text}
    </span>
  {:else}
    <span class="{phone ? 'text-[13px]' : 'text-[14px]'} text-text-muted">
      {#if route && s.left > 0}Hit <strong class="text-accent">{route.join(' then ')}</strong> to make it and move up to {s.target +
          1}.{:else}{hint}{/if}
    </span>
  {/if}
{/snippet}

<section
  aria-label="Target {s.target}, {s.left} left, {used} of {game.cfg.dartsPerTry} darts used"
  class="box-border rounded-[18px] flex flex-col min-w-0 {playerCard(active)} {variant === 'solo'
    ? 'w-[300px] xl:w-[400px] shrink-0 px-[22px] py-5 gap-4 xl:px-[26px] xl:py-6'
    : phone
      ? 'px-4 py-3 gap-2'
      : 'flex-1 p-[18px] gap-3 xl:p-6'}"
>
  {#if phone}
    <div class="flex items-center justify-between">
      <span class={label}>Left</span>
      <span class="flex items-baseline gap-[6px]">
        <span class={label}>Target</span>
        <span class="font-display font-bold text-[28px] leading-none text-accent">{s.target}</span>
      </span>
    </div>
    <div class="flex items-end justify-between gap-3">
      <span class="font-display font-bold text-[120px] leading-[0.85] tracking-[-0.02em]">{s.left}</span>
      <span class="flex flex-col items-end gap-2 pb-2">
        <span class={label}>{plural(game.cfg.dartsPerTry - used, 'dart')} left</span>
        {@render pipRow('w-[14px] h-[14px]')}
      </span>
    </div>
    {@render hintLine()}
  {:else}
    <div class="flex items-center gap-3 min-w-0">
      <Avatar {name} tone={active ? 'accent' : 'default'} size={40} />
      <span class="text-[22px] font-semibold truncate">{name}</span>
      <span class="ml-auto flex items-baseline gap-[6px]">
        <span class={label}>Target</span>
        <span class="font-display font-bold text-[34px] text-accent">{s.target}</span>
      </span>
    </div>
    <div class="flex flex-col">
      <span class={label}>Left</span>
      <span
        class="font-display font-bold leading-[0.85] tracking-[-0.02em] {variant === 'solo'
          ? 'text-[150px] xl:text-[200px]'
          : 'text-[120px] xl:text-[160px]'} {active ? 'text-text' : 'text-ink-3'}">{s.left}</span
      >
    </div>
    <div class="flex flex-col gap-[10px]">
      <span class={label}>Darts · {game.cfg.dartsPerTry - used} left</span>
      {@render pipRow('w-[18px] h-[18px]')}
    </div>
    {@render hintLine()}
    {#if rows.length}
      <div class="mt-auto p-[10px] rounded-[12px] bg-surface-1 border border-line">
        <div class="grid grid-cols-2 gap-5 px-3 pb-[6px] text-[11px] font-semibold label-caps text-text-dim">
          <span class="text-right">Scored</span><span>Left</span>
        </div>
        {#each rows as r, i (i)}
          <div
            class="grid grid-cols-2 gap-5 px-3 py-[6px] rounded-[8px] font-display font-bold text-[30px] {r.open
              ? 'bg-surface-active'
              : ''}"
          >
            <span class="text-right {r.open ? 'text-accent' : 'text-text'}">{r.scored}</span>
            <span class={r.open ? 'text-text' : 'text-text-dim'}>{r.left}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>
