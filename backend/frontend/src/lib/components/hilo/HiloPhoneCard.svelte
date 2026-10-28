<!--
  Higher Lower on a phone (HiLo-Phone): the thrower's card (name, pill, hearts, Needs, last visit),
  or a compact row for everyone else.
-->
<script lang="ts">
  import type { HiloGame } from '$lib/api/game-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import PlayerPill from '$lib/components/PlayerPill.svelte'
  import Hearts from '$lib/components/hilo/Hearts.svelte'
  import { ordinal, plural } from '$lib/fmt'
  import { needsLine, outcomeText } from '$lib/hilo/view'
  import { LOST_CARD, playerCard } from '$lib/playerCard'

  let {
    game,
    seat,
    name,
    active,
    upNext,
    justLost,
  }: { game: HiloGame; seat: number; name: string; active: boolean; upNext: boolean; justLost: boolean } = $props()

  const s = $derived(game.seats[seat])
  const last = $derived(s.visits.at(-1))
  const lost = $derived(last?.outcome === 'between' || last?.outcome === 'miss')
  const lives = $derived(`${s.lives} of ${plural(game.cfg.lives, 'life', 'lives')}`)
  const prefix = $derived(s.out ? `Out${s.place ? ` · ${ordinal(s.place)}` : ''}` : upNext && !justLost ? 'Up next' : null)
  const result = $derived(last ? outcomeText(last) : '')
  // "Up next · lost a life · 45": the result reads on in lower case after a prefix
  const sub = $derived(prefix ? [prefix, result.replace(/^[A-Z]/, c => c.toLowerCase())].filter(Boolean).join(' · ') : result)
</script>

{#if active}
  <section
    aria-label="{name}, throwing, {lives}"
    class="shrink-0 box-border px-[14px] pt-3 pb-[14px] rounded-[16px] flex flex-col gap-[10px] {playerCard(true)}"
  >
    <div class="flex items-center gap-2 min-w-0">
      <Avatar {name} tone="accent" size={30} />
      <span class="text-[16px] font-semibold truncate">{name}</span>
      <PlayerPill kind="throwing" small />
      <span class="ml-auto"><Hearts lives={s.lives} total={game.cfg.lives} size="w-[26px] h-[26px]" /></span>
    </div>
    <div class="flex items-baseline justify-between gap-[10px]">
      <span class="flex flex-col gap-[1px]">
        <span class="text-[10px] label-caps text-text-muted">Needs</span>
        <span class="font-display font-bold text-[26px] leading-none text-accent">{needsLine(game)}</span>
      </span>
      {#if last}
        <span class="flex flex-col items-end gap-[1px] min-w-0">
          <span class="text-[10px] label-caps text-text-muted">Last visit</span>
          <span class="text-[13px] whitespace-nowrap {lost ? 'text-live-text' : 'text-accent'}">{outcomeText(last)}</span>
        </span>
      {/if}
    </div>
  </section>
{:else}
  <section
    aria-label="{name}, {sub ? `${sub}, ` : ''}{lives}"
    class="shrink-0 h-[58px] box-border px-[14px] rounded-[12px] flex items-center gap-[10px] {justLost
      ? LOST_CARD
      : playerCard(false)} {s.out ? 'opacity-60' : ''}"
  >
    <Avatar {name} size={32} />
    <span class="flex flex-col gap-[2px] min-w-0">
      <span class="text-[15px] font-semibold text-ink-2 truncate {s.out ? 'line-through' : ''}">{name}</span>
      <span class="text-[12px] truncate {lost && !s.out ? 'text-[#e0827a]' : 'text-text-dim'}">{sub}</span>
    </span>
    <span class="ml-auto shrink-0"
      ><Hearts lives={s.lives} total={game.cfg.lives} tone={justLost ? 'accent' : 'muted'} {justLost} size="w-5 h-5" /></span
    >
  </section>
{/if}
