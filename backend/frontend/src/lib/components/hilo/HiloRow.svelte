<!--
  A Higher Lower party row (HiLo-Party): name and pill, the hearts, then Needs and the last visit
  for the thrower, the last visit for the others, and where a player who is out went out.
-->
<script lang="ts">
  import { ArrowDown, ArrowUp, X } from '@lucide/svelte'
  import type { HiloGame } from '$lib/api/game-ws'
  import RowShell from '$lib/components/RowShell.svelte'
  import Hearts from '$lib/components/hilo/Hearts.svelte'
  import { ordinal, plural } from '$lib/fmt'
  import { needsLine, outcomeText } from '$lib/hilo/view'

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
  const pill = $derived(s.out ? 'out' : justLost ? 'lost' : active ? 'throwing' : upNext ? 'up-next' : null)
  const state = $derived(s.out ? outLabel.toLowerCase() : justLost ? 'just lost a life' : active ? 'throwing' : upNext ? 'up next' : null)
</script>

<!-- The thrower's row takes a bigger share of the column -->
<div class="shrink-0 {active ? 'grow-[1.4]' : 'grow'} min-h-0 flex flex-col">
  <RowShell
    {name}
    {active}
    {pill}
    pillLabel={s.out ? outLabel : undefined}
    tone={s.out ? 'out' : justLost ? 'lost' : null}
    label="{name}, {state ? `${state}, ` : ''}{s.lives} of {plural(game.cfg.lives, 'life', 'lives')}"
    class="{active ? 'py-5' : 'py-4'} grid-cols-[minmax(0,160px)_auto_minmax(0,1fr)] xl:grid-cols-[200px_190px_minmax(0,1fr)]"
  >
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
          <span class="font-display font-bold text-[26px] xl:text-[34px] leading-none whitespace-nowrap text-accent">{needsLine(game)}</span
          >
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
  </RowShell>
</div>
