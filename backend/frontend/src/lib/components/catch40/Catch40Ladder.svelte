<!--
  Catch 40's target ladder: one entry per target with its points, then the open target.
  'list' is the desktop solo session panel's ladder (scrolls); 'dots' the row of dots on phones and
  on the multiplayer cards, with every target still to come.
-->
<script lang="ts">
  import type { Catch40Game } from '$lib/api/game-ws'
  import { pointsLabel, TARGETS } from '$lib/catch40/view'

  let { game, seat, variant }: { game: Catch40Game; seat: number; variant: 'list' | 'dots' } = $props()

  const s = $derived(game.seats[seat])
  const open = $derived(!s.done && game.phase !== 'finished')
  const later = $derived(Math.max(0, TARGETS - s.tries.length - (open ? 1 : 0)))
  const tone = (points: number) => (points > 0 ? 'bg-accent-tint text-accent' : 'bg-live-soft text-live')
</script>

{#if variant === 'list'}
  <ol class="flex flex-col">
    {#each [...s.tries].reverse() as t (t.target)}
      <li class="grid grid-cols-[1fr_auto_auto] items-center gap-[10px] min-h-[38px] border-b border-line">
        <span class="font-display font-bold text-section-title leading-none">{t.target}</span>
        <span class="text-small text-text-muted">{t.finish ? `${t.finish} · ${t.darts} darts` : 'missed'}</span>
        <span class="size-7 rounded-full grid place-items-center font-mono text-small font-semibold {tone(t.points)}">{t.points}</span>
      </li>
    {/each}
    {#if open}
      <li
        class="grid grid-cols-[1fr_auto] items-center gap-[10px] min-h-[42px] mx-[-10px] px-[10px] rounded-md bg-surface-picked ring-[1.5px] ring-inset ring-accent"
        aria-current="step"
      >
        <span class="font-display font-bold text-section-title leading-none text-accent">{s.target}</span>
        <span class="text-small text-text">{s.darts === 0 && s.left === s.target ? 'now' : `in progress · ${s.left} left`}</span>
      </li>
    {/if}
  </ol>
{:else}
  <div class="flex flex-wrap gap-[4px]" role="img" aria-label="Targets: {s.total} points from {s.tries.length} of {TARGETS}">
    {#each s.tries as t (t.target)}
      <span
        class="size-[26px] rounded-full grid place-items-center type-mono-sm font-semibold {tone(t.points)}"
        title="{t.target}: {pointsLabel(t.points)}">{t.points}</span
      >
    {/each}
    {#if open}<span class="size-[26px] rounded-full border-2 border-accent box-border" title="Now: {s.target}"></span>{/if}
    {#each Array.from({ length: later }, (_, i) => i) as i (i)}
      <span class="size-[26px] rounded-full border-[1.5px] border-dashed border-line-chip box-border"></span>
    {/each}
  </div>
{/if}
