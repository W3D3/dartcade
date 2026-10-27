<script lang="ts">
  // X01 on the big screen (Presenter-Landscape, -Landscape-Party, -Portrait): the scores, the open visit and the finish to aim at.
  import type { Snapshot } from '$lib/ws'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { x01Live, type X01LiveSeat } from '$lib/bigscreen/x01View'
  import { plural } from '$lib/fmt'
  import { boardCheckoutTargets, type Slot } from '$lib/dartSlots'
  import Avatar from '$lib/components/Avatar.svelte'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import BigHeader from './BigHeader.svelte'

  let { snapshot, orientation }: { snapshot: Snapshot; orientation: Orientation; countdown?: string } = $props()
  const v = $derived(x01Live(snapshot))
  const darts = $derived(snapshot.gameId === 'x01' ? snapshot.game.currentVisitDarts : [])
  const landscape = $derived(orientation === 'landscape')
  // The party layout: the thrower's card, the others as rows
  const party = $derived(v.party)
  const thrower = $derived(v.seats.find(s => s.throwing) ?? v.seats[0])
  const others = $derived(v.seats.filter(s => s !== thrower))

  const label = 'text-[24px] font-bold tracking-[0.12em] text-text-dim'
  const num = 'font-display font-bold'
  const slotLook: Record<Slot['kind'], string> = {
    thrown: 'border-[3px] border-accent bg-accent text-accent-fg',
    miss: 'border-[3px] border-line-chip bg-surface-1 text-text-muted',
    'suggested-next': 'border-4 border-dashed border-accent text-text',
    'suggested-later': 'border-[3px] border-dashed border-line-chip text-[#6d7066]',
    'empty-next': 'border-[3px] border-dashed border-line-chip',
    'empty-later': 'border-[3px] border-dashed border-line-chip',
  }
  const slotNum = $derived(landscape ? (party ? 'text-[84px]' : 'text-[96px]') : 'text-[88px]')
</script>

{#snippet pips(s: X01LiveSeat, size: number)}
  <span class="ml-auto flex gap-2" aria-label="{plural(s.legs, 'leg')} won">
    {#each { length: v.firstTo } as _, i (i)}
      <span
        class="box-border rounded-full {i < s.legs ? 'bg-accent' : 'border-[3px] border-[#55594f]'}"
        style="width:{size}px;height:{size}px"
      ></span>
    {/each}
  </span>
{/snippet}

{#snippet card(s: X01LiveSeat, scoreSize: number, pad: number)}
  <section
    aria-label="{s.name}: {s.score} left"
    class="box-border flex min-w-0 flex-1 basis-0 flex-col justify-between gap-3.5 rounded-[28px] {s.throwing
      ? 'border-4 border-accent bg-[#161b0f]'
      : 'border-2 border-line bg-surface-1'}"
    style="padding:{pad}px"
  >
    <div class="flex items-center gap-[18px]">
      <Avatar name={s.name} size={64} tone={s.throwing ? 'accent' : 'quiet'} />
      <span class="truncate text-[44px] font-bold">{s.name}</span>
      {@render pips(s, 18)}
    </div>
    <div>
      {#if s.throwing}
        <span
          class="inline-flex h-[46px] items-center rounded-full bg-accent px-5 text-[26px] font-extrabold tracking-[0.14em] text-accent-fg"
          >THROWING</span
        >
      {:else if s.next}
        <span
          class="inline-flex h-[46px] items-center rounded-full border-2 border-line-chip px-5 text-[26px] font-extrabold tracking-[0.14em] text-text-muted"
          >NEXT</span
        >
      {:else}
        <span class="inline-block h-[46px]"></span>
      {/if}
    </div>
    <span class="{num} leading-[0.8] tracking-[-0.02em] {s.throwing ? 'text-text' : 'text-ink-3'}" style="font-size:{scoreSize}px"
      >{s.score}</span
    >
    <div class="flex gap-10">
      <span class="flex flex-col gap-1"><span class={label}>AVG</span><span class="{num} text-[56px] leading-none">{s.avg}</span></span>
      <span class="flex flex-col gap-1"><span class={label}>DARTS</span><span class="{num} text-[56px] leading-none">{s.darts}</span></span>
      {#if party && v.checkout}
        <span class="ml-auto flex flex-col gap-1 text-right">
          <span class={label}>CHECKOUT</span><span class="{num} text-[56px] leading-none text-accent">{v.checkout.route}</span>
        </span>
      {/if}
    </div>
  </section>
{/snippet}

{#snippet row(s: X01LiveSeat)}
  <div class="box-border flex min-h-0 flex-1 basis-0 items-center gap-[22px] rounded-[22px] border-2 border-line bg-surface-1 px-[30px]">
    <Avatar name={s.name} size={56} tone={s.next ? 'accent' : 'quiet'} />
    <span class="min-w-0 flex-1 truncate text-[40px] font-bold">{s.name}</span>
    {@render pips(s, 16)}
    <span class="w-[110px] text-right text-[30px] text-text-dim">{s.avg}</span>
    <span class="{num} w-[170px] text-right text-[84px] leading-none text-ink-3">{s.score}</span>
  </div>
{/snippet}

{#snippet checkoutBox(route: string, text: string, size: number)}
  <div
    class="box-border flex h-[150px] flex-none items-center gap-[30px] rounded-3xl border-2 border-[#3a4a20] px-9"
    style="background:linear-gradient(90deg,#1d2a0c,#151a0e)"
  >
    <span class="flex flex-col">
      <span class="text-[28px] font-extrabold tracking-[0.14em] text-accent">CHECKOUT</span>
      <span class="whitespace-nowrap text-[28px] text-ink-2">{text}</span>
    </span>
    <span class="{num} ml-auto whitespace-nowrap leading-none tracking-[0.02em] text-accent" style="font-size:{size}px">{route}</span>
  </div>
{/snippet}

{#snippet visitRow(height: number, totalSize: number)}
  <div class="flex flex-none gap-[18px]" style="height:{height}px">
    {#if v.bullOff}
      <div class="box-border flex flex-1 items-center justify-center rounded-3xl border-2 border-line bg-surface-1">
        <span class="{num} text-[96px] uppercase leading-none tracking-[0.04em] text-text-muted">Bull off</span>
      </div>
    {:else}
      <div
        class="box-border flex min-w-0 flex-[0.9_1_0] flex-col items-center justify-center rounded-3xl border-2 border-line bg-surface-1"
      >
        <span class="text-[26px] font-bold tracking-[0.12em] text-text-dim">THIS VISIT</span>
        <span class="{num} leading-[0.95]" style="font-size:{totalSize}px">{v.visit.total}</span>
      </div>
      {#each v.slots as slot, i (i)}
        <div class="box-border flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1.5 rounded-3xl {slotLook[slot.kind]}">
          {#if slot.label}
            <span class="{num} leading-[0.9] {slotNum}">{slot.label}</span>
            {#if slot.kind === 'thrown' || slot.kind === 'miss'}
              <span class="text-[26px] font-bold tracking-[0.06em]">{slot.points}</span>
            {:else}
              <span class="text-[26px] font-bold uppercase tracking-[0.06em] text-text-muted">{slot.foot.toUpperCase()}</span>
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet board()}
  <div class="flex size-full items-center justify-center [container-type:size]">
    <div class="aspect-square" style="width:min(100cqw,100cqh)">
      <DartBoard {darts} checkoutTargets={boardCheckoutTargets(v.slots, true)} />
    </div>
  </div>
{/snippet}

<div class="flex size-full flex-col bg-bg-deep">
  <BigHeader title={v.header.title} meta={landscape ? v.header.meta : v.header.leg} board={v.header.board}>
    {#snippet badge()}
      <span
        class="inline-flex h-11 items-center gap-2.5 rounded-full bg-live-soft px-[18px] text-[24px] font-extrabold tracking-[0.14em] text-live"
      >
        <span class="size-3 animate-pulse rounded-full bg-live"></span>LIVE
      </span>
    {/snippet}
  </BigHeader>

  {#if landscape}
    <main class="box-border flex min-h-0 flex-1 gap-10 px-[44px] pb-9 pt-7">
      <div class="flex-none" style="width:{party ? 840 : 800}px">{@render board()}</div>
      <div class="flex min-w-0 flex-1 flex-col {party ? 'gap-[18px]' : 'gap-[22px]'}">
        {#if party}
          <div class="flex h-[430px] flex-none">{@render card(thrower, 170, 34)}</div>
          <div class="flex min-h-0 flex-1 flex-col gap-3.5">
            {#each others as s, i (i)}{@render row(s)}{/each}
          </div>
          {@render visitRow(170, 104)}
        {:else}
          <div class="flex min-h-0 flex-1 gap-[22px]">
            {#each v.seats as s, i (i)}{@render card(s, 230, 34)}{/each}
          </div>
          {#if v.checkout && !v.bullOff}{@render checkoutBox(v.checkout.route, v.checkout.text, 110)}{/if}
          {@render visitRow(200, 116)}
        {/if}
      </div>
    </main>
  {:else}
    <main class="box-border flex min-h-0 flex-1 flex-col gap-6 px-10 pb-10 pt-[30px]">
      {#if party}
        <div class="flex h-[560px] flex-none flex-col gap-3.5">
          <div class="flex min-h-0 flex-[2_1_0]">{@render card(thrower, 200, 30)}</div>
          <div class="flex min-h-0 flex-[1.4_1_0] flex-col gap-3">
            {#each others as s, i (i)}{@render row(s)}{/each}
          </div>
        </div>
      {:else}
        <div class="flex h-[560px] flex-none gap-[22px]">
          {#each v.seats as s, i (i)}{@render card(s, 230, 30)}{/each}
        </div>
      {/if}
      {#if v.checkout && !v.bullOff}{@render checkoutBox(v.checkout.route, v.checkout.text, 100)}{/if}
      {@render visitRow(190, 108)}
      <div class="min-h-0 flex-1">{@render board()}</div>
    </main>
  {/if}
</div>
