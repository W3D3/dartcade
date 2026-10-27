<script lang="ts">
  // 121 Checkout on the big screen (Presenter-121-Landscape, -Portrait): the try, the target and what is left, the route to finish, the open visit and the session.
  import type { Snapshot } from '$lib/ws'
  import type { Orientation } from '$lib/bigscreen/stage'
  import { p121Live, routeFontSize } from '$lib/bigscreen/p121View'
  import { LABEL, NUM, type LiveSizes } from '$lib/bigscreen/look'
  import CheckoutPanel from './CheckoutPanel.svelte'
  import LiveFrame from './LiveFrame.svelte'
  import SeatHead from './SeatHead.svelte'
  import SeatShell from './SeatShell.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import Stat from './Stat.svelte'
  import StatusPill from './StatusPill.svelte'
  import VisitRow from './VisitRow.svelte'

  let { snapshot, orientation }: { snapshot: Snapshot; orientation: Orientation } = $props()
  const v = $derived(p121Live(snapshot))
  const me = $derived(v.seats[v.thrower])
  const others = $derived(v.seats.filter((_, i) => i !== v.thrower))
  const tone = {
    made: 'border-checkout-line bg-checkout-to',
    missed: 'border-[#5a2622] bg-[#1c1210]',
    current: 'border-accent bg-surface-1 border-4',
  }
  const num = { made: 'text-accent', missed: 'text-live', current: 'text-text' }
</script>

{#snippet card()}
  <SeatShell active variant="card" label="{me.name}: {me.left} left">
    <SeatHead name={me.name} active>
      <StatusPill kind="throwing" text={v.bullOff ? 'BULL OFF' : me.tryLabel} />
    </SeatHead>
    {#if !v.bullOff}
      <div class="flex items-end gap-10">
        <Stat label="TARGET" value={me.target} size={155} leading={0.85} gap={0} tone="text-ink-2" />
        <span class="ml-auto"><Stat label="LEFT" value={me.left} size={250} leading={0.8} gap={0} tone="text-accent" right /></span>
      </div>
      <div class="flex items-center gap-4">
        <span class={LABEL}>DARTS</span>
        <span class="flex gap-2.5" role="img" aria-label="{v.dartsLeft.text} of {v.dartsLeft.total}">
          {#each { length: v.dartsLeft.total } as _, i (i)}
            <span class="box-border size-[26px] rounded-full {i < v.dartsLeft.used ? 'bg-accent' : 'border-[3px] border-line-chip'}"></span>
          {/each}
        </span>
        <span class="ml-auto text-[30px] font-bold">{v.dartsLeft.text}</span>
      </div>
    {/if}
  </SeatShell>
{/snippet}

{#snippet others_()}
  {#if others.length}
    <div class="flex flex-none gap-3.5">
      {#each others as s, i (i)}
        <div class="box-border flex min-w-0 flex-1 basis-0 items-center gap-4 rounded-[22px] border-2 border-line bg-surface-1 px-6 py-3">
          <Avatar name={s.name} size={48} tone="quiet" />
          <span class="min-w-0 flex-1 truncate text-[32px] font-bold">{s.name}</span>
          <span class="{NUM} text-[44px] leading-none text-ink-3">{s.target}</span>
          <span class="text-[24px] text-text-dim">{s.made}</span>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet session()}
  {#if !v.bullOff}
    <div class="flex h-[170px] flex-none gap-4">
      <div
        class="box-border flex min-w-0 flex-[0.9_1_0] flex-col justify-center gap-1 rounded-[22px] border-2 border-line bg-surface-1 px-5 py-4"
      >
        <Stat label="SESSION" value={v.session.score} size={64} />
        <span class="text-[24px] font-semibold text-ink-2">made</span>
      </div>
      {#each v.session.tries as t, i (i)}
        <div class="box-border flex min-w-0 flex-1 basis-0 flex-col justify-center gap-1 rounded-[22px] border-2 px-5 py-4 {tone[t.state]}">
          <Stat label={t.label} value={t.target} size={64} tone={num[t.state]} />
          <span class="whitespace-nowrap text-[24px] font-semibold text-ink-2">{t.note}</span>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<LiveFrame board={v.board} header={v.header} {orientation} boardWidth={800}>
  {#snippet panel(sz: LiveSizes)}
    {#if sz.portrait}
      <div class="flex h-[600px] flex-none">{@render card()}</div>
    {:else}
      {@render card()}
    {/if}
    {@render others_()}
    {#if v.checkout}
      <CheckoutPanel
        label={v.checkout.label}
        text={v.checkout.text}
        route={v.checkout.route}
        routeSize={routeFontSize(v.checkout.route, orientation)}
        danger={v.checkout.label === 'BUST'}
      />
    {/if}
    <VisitRow total={v.visit.total} tiles={v.slots} bullOff={v.bullOff} spare="SPARE DART" {...sz.compact} />
    {@render session()}
  {/snippet}
</LiveFrame>
