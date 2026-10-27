<script lang="ts">
  // A finished game without its own result design: the winner and the placings, and the countdown to the idle screen.
  import { winView } from '$lib/winScreen'
  import { placings } from '$lib/bigscreen/result'
  import { ordinal } from '$lib/fmt'
  import type { Snapshot } from '$lib/ws'

  let { snapshot, countdown }: { snapshot: Snapshot; countdown: string } = $props()
  const rows = $derived(placings(snapshot))
  // Without a winner (121) the order is just the seats
  const hasWinner = $derived(snapshot.status === 'finished' && winView(snapshot, null) !== null)
</script>

<div class="flex size-full flex-col items-center justify-center gap-12 px-24 text-center">
  <div class="font-mono text-[28px] uppercase tracking-[0.2em] text-text-dim">Game over</div>
  {#if hasWinner}
    <h1 class="m-0 font-display text-[170px] font-bold uppercase leading-none text-accent">{rows[0].name}</h1>
    <div class="text-[44px] text-text-muted">wins</div>
  {/if}
  <ol class="m-0 flex list-none flex-col gap-3 p-0 text-[48px]">
    {#each rows as r, i (i)}
      <li><span class="font-display font-bold text-text-muted">{ordinal(r.placement)}</span> {r.name}</li>
    {/each}
  </ol>
  <div class="font-mono text-[30px] text-text-dim">{countdown}</div>
</div>
