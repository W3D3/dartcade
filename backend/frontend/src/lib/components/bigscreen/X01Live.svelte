<script lang="ts">
  // X01 on the big screen (Presenter-Landscape, -Landscape-Party, -Portrait): the scores, the open visit and the finish to aim at.
  import type { Snapshot } from '$lib/ws'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { x01Live, type X01LiveSeat } from '$lib/bigscreen/x01View'
  import { pillKind, rowScale } from '$lib/bigscreen/rowScale'
  import { NUM, type LiveSizes } from '$lib/bigscreen/look'
  import { plural } from '$lib/fmt'
  import CheckoutPanel from './CheckoutPanel.svelte'
  import LiveFrame from './LiveFrame.svelte'
  import SeatHead from './SeatHead.svelte'
  import SeatShell from './SeatShell.svelte'
  import Seats from './Seats.svelte'
  import Stat from './Stat.svelte'
  import StatusPill from './StatusPill.svelte'
  import VisitRow from './VisitRow.svelte'

  let { snapshot, orientation }: { snapshot: Snapshot; orientation: Orientation } = $props()
  const v = $derived(x01Live(snapshot))
  const portrait = $derived(orientation === 'portrait')
  const rs = $derived(rowScale(v.seats.length))
  // The party layout: the thrower's card, the others as rows
  const thrower = $derived(v.seats.find(s => s.throwing) ?? v.seats[0])
  const others = $derived(v.seats.filter(s => s !== thrower))
  const scoreSize = $derived(v.party ? (portrait ? 200 : 170) : 230)
</script>

{#snippet pips(s: X01LiveSeat, size: number)}
  <span class="ml-auto flex gap-2" role="img" aria-label="{plural(s.legs, 'leg')} won">
    {#each { length: v.firstTo } as _, i (i)}
      <span
        class="box-border rounded-full {i < s.legs ? 'bg-accent' : 'border-[3px] border-pip-dim'}"
        style="width:{size}px;height:{size}px"
      ></span>
    {/each}
  </span>
{/snippet}

{#snippet card(s: X01LiveSeat)}
  <SeatShell active={s.throwing} variant="card" label="{s.name}: {s.score} left">
    <SeatHead name={s.name} active={s.throwing}>{@render pips(s, 18)}</SeatHead>
    <div class="h-[46px]"><StatusPill kind={pillKind(s)} /></div>
    <span class="{NUM} leading-[0.8] tracking-[-0.02em] {s.throwing ? 'text-text' : 'text-ink-3'}" style="font-size:{scoreSize}px"
      >{s.score}</span
    >
    <div class="flex gap-10">
      <Stat label="AVG" value={s.avg} />
      <Stat label="DARTS" value={s.darts} />
      {#if v.party && v.checkout}<span class="ml-auto"><Stat label="CHECKOUT" value={v.checkout.route} tone="text-accent" right /></span
        >{/if}
    </div>
  </SeatShell>
{/snippet}

{#snippet row(s: X01LiveSeat)}
  <SeatShell active={false} variant="row" label="{s.name}: {s.score} left">
    <SeatHead name={s.name} active={s.next} scale={rs}>
      {@render pips(s, 16)}
      <span class="w-[110px] text-right text-text-dim" style="font-size:{rs.detail}px">{s.avg}</span>
      <span class="{NUM} w-[170px] text-right leading-none text-ink-3" style="font-size:{rs.num}px">{s.score}</span>
    </SeatHead>
  </SeatShell>
{/snippet}

<LiveFrame
  board={v.board}
  header={{ ...v.header, meta: portrait ? v.header.leg : v.header.meta }}
  {orientation}
  boardWidth={v.party ? 840 : 800}
>
  {#snippet panel(sz: LiveSizes)}
    {#if v.party && portrait}
      <div class="flex h-[560px] flex-none flex-col gap-3.5">
        <div class="flex min-h-0 flex-[2_1_0]">{@render card(thrower)}</div>
        <Seats seats={others} party portrait {card} {row} />
      </div>
    {:else if v.party}
      <div class="flex h-[430px] flex-none">{@render card(thrower)}</div>
      <Seats seats={others} party {card} {row} />
    {:else}
      <Seats seats={v.seats} party={false} {portrait} cardsHeight={560} {card} {row} />
    {/if}
    <!-- the landscape party layout shows the finish in the thrower's card instead -->
    {#if v.checkout && !v.bullOff && !(v.party && !portrait)}
      <CheckoutPanel label="CHECKOUT" text={v.checkout.text} route={v.checkout.route} routeSize={portrait ? 100 : 110} />
    {/if}
    <VisitRow total={v.visit.total} tiles={v.slots} bullOff={v.bullOff} {...v.party ? sz.compact : sz.visit} />
  {/snippet}
</LiveFrame>
