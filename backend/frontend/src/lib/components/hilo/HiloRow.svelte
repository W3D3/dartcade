<!--
  A Higher Lower party row (HiLo-Party): name and pill, the hearts, then Needs and the last visit
  for the thrower, the last visit for the others, and where a player who is out went out.
-->
<script lang="ts">
  import { ArrowDown, ArrowUp, X } from '@lucide/svelte'
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
  }: {
    game: HiloGame
    seat: number
    name: string
    active: boolean
    upNext: boolean
    justLost: boolean
  } = $props()

  const s = $derived(game.seats[seat])
  const last = $derived(s.visits.at(-1))
  const lost = $derived(last?.outcome === 'between' || last?.outcome === 'miss')
  const outLabel = $derived(`Out${s.place ? ` · ${ordinal(s.place)}` : ''}`)
  const card = $derived(s.out ? 'bg-[#121411] border border-dashed border-line-2' : justLost ? LOST_CARD : playerCard(active))
  const state = $derived(s.out ? outLabel.toLowerCase() : justLost ? 'just lost a life' : active ? 'throwing' : upNext ? 'up next' : null)
</script>

<section
  aria-label="{name}, {state ? `${state}, ` : ''}{s.lives} of {plural(game.cfg.lives, 'life', 'lives')}"
  class="shrink-0 {active
    ? 'grow-[1.4] py-5'
    : 'grow py-4'} box-border px-4 xl:px-6 rounded-[16px] grid grid-cols-[minmax(0,160px)_auto_minmax(0,1fr)] xl:grid-cols-[200px_190px_minmax(0,1fr)] gap-4 xl:gap-5 items-center {card}"
>
  <div class="flex flex-col gap-[10px] min-w-0">
    <div class="flex items-center gap-[10px] min-w-0">
      <span class={s.out ? 'opacity-50' : ''}><Avatar {name} tone={active ? 'accent' : 'default'} size={40} /></span>
      <span
        class="text-[21px] font-semibold truncate {s.out ? 'text-[#6d7066] line-through' : active || justLost ? 'text-text' : 'text-ink-2'}"
        >{name}</span
      >
    </div>
    {#if s.out}
      <span
        class="self-start inline-flex items-center h-[26px] px-[10px] rounded-full bg-surface-paused text-text-dim text-[12px] font-bold uppercase tracking-[0.08em]"
        >{outLabel}</span
      >
    {:else if justLost}
      <span
        class="self-start inline-flex items-center h-[26px] px-[10px] rounded-full bg-live text-bg text-[12px] font-bold uppercase tracking-[0.08em]"
        >−1 life</span
      >
    {:else if active}<PlayerPill kind="throwing" small />{:else if upNext}<PlayerPill kind="up-next" small />{/if}
  </div>

  <Hearts
    lives={s.lives}
    total={game.cfg.lives}
    tone={active || justLost ? 'accent' : 'muted'}
    {justLost}
    size={active ? 'w-9 h-9 xl:w-[52px] xl:h-[52px]' : 'w-8 h-8 xl:w-10 xl:h-10'}
  />

  <div class="flex flex-col gap-3 min-w-0">
    {#if active}
      <div class="flex flex-col gap-1">
        <span class="text-[13px] label-caps text-text-muted">Needs</span>
        <span class="font-display font-bold text-[26px] xl:text-[34px] leading-none whitespace-nowrap text-accent">{needsLine(game)}</span>
      </div>
    {/if}
    {#if last}
      <div class="flex flex-col gap-1 min-w-0">
        <span class="text-[12px] label-caps {s.out ? 'text-[#6d7066]' : 'text-text-dim'}"
          >{s.out ? `Went out in round ${s.outRound}` : 'Last visit'}</span
        >
        <span
          class="flex items-center gap-2 text-[16px] truncate {s.out
            ? 'text-text-dim'
            : lost
              ? 'text-[#e0827a]'
              : active
                ? 'text-accent'
                : 'text-[#a7c45a]'}"
        >
          {#if !s.out}
            {#if lost}<X size={16} strokeWidth={3} class="text-live shrink-0" />{:else if last.outcome === 'high'}<ArrowUp
                size={16}
                class="shrink-0"
              />{:else}<ArrowDown size={16} class="shrink-0" />{/if}
          {/if}
          {outcomeText(last)}
        </span>
      </div>
    {/if}
  </div>
</section>
