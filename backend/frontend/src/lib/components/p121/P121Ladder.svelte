<!--
  121's target ladder: one entry per try, made (tick) or missed (cross), then the open try.
  'list' is the desktop solo session panel's ladder; 'dots' the row of dots on phones and on the
  multiplayer cards, with every try still to come.
-->
<script lang="ts">
  import { Check, X } from '@lucide/svelte'
  import type { P121Game } from '$lib/api/game-ws'
  import { plural } from '$lib/fmt'
  import { missedNext } from '$lib/p121/view'

  let {
    game,
    seat,
    variant,
    visitDarts = 0,
  }: {
    game: P121Game
    seat: number
    variant: 'list' | 'dots'
    /** Darts in the open visit (the open try's row says it's in progress). */
    visitDarts?: number
  } = $props()

  const s = $derived(game.seats[seat])
  // A miss names where the next try started: the next try's target, or the open one's
  const missNote = (i: number) => missedNext(s.tries[i].target, s.tries[i + 1]?.target ?? s.target)
  const open = $derived(!s.done && game.phase !== 'finished')
  const openNote = $derived(
    s.left === 0 ? `made · ${plural(s.darts + visitDarts, 'dart')}` : s.darts + visitDarts === 0 ? 'now' : `in progress · ${s.left} left`,
  )
  const later = $derived(Math.max(0, game.cfg.tries - s.tries.length - (open ? 1 : 0)))
</script>

{#if variant === 'list'}
  <ol class="m-0 p-0 list-none flex flex-col">
    {#each s.tries as t, i (i)}
      <li class="grid grid-cols-[54px_30px_1fr_auto] items-center gap-[10px] min-h-[42px] border-b border-line">
        <span class="font-mono text-[12px] text-text-dim">Try {i + 1}</span>
        <span
          class="w-6 h-6 rounded-full grid place-items-center {t.made ? 'bg-accent-tint text-accent' : 'bg-live-soft text-live'}"
          role="img"
          aria-label={t.made ? 'made' : 'missed'}
        >
          {#if t.made}<Check size={13} strokeWidth={3} />{:else}<X size={13} strokeWidth={3} />{/if}
        </span>
        <span class="font-display font-bold text-[26px] leading-none">{t.target}</span>
        <span class="text-[13px] {t.made ? 'text-ink-2' : 'text-text-muted'}">{t.made ? plural(t.darts, 'dart') : missNote(i)}</span>
      </li>
    {/each}
    {#if open}
      <li
        class="grid grid-cols-[54px_30px_1fr_auto] items-center gap-[10px] min-h-[46px] mt-1 -mx-[10px] px-[10px] rounded-[10px] bg-surface-picked ring-[1.5px] ring-inset ring-accent"
        aria-current="step"
      >
        <span class="font-mono text-[12px] text-accent">Try {s.tries.length + 1}</span>
        <span class="w-6 h-6 rounded-full border-2 border-accent box-border"></span>
        <span class="font-display font-bold text-[26px] leading-none text-accent">{s.target}</span>
        <span class="text-[13px] text-text">{openNote}</span>
      </li>
    {/if}
  </ol>
{:else}
  <div class="flex flex-wrap gap-[6px]" role="img" aria-label="Target ladder: {s.made} of {s.tries.length} made">
    {#each s.tries as t, i (i)}
      <span class="flex flex-col items-center gap-1">
        <span
          class="w-[30px] h-[30px] rounded-full grid place-items-center {t.made ? 'bg-accent-tint text-accent' : 'bg-live-soft text-live'}"
        >
          {#if t.made}<Check size={14} strokeWidth={3} />{:else}<X size={14} strokeWidth={3} />{/if}
        </span>
        <span class="text-[11px] text-text-muted">{t.target}</span>
      </span>
    {/each}
    {#if open}
      <span class="flex flex-col items-center gap-1">
        <span class="w-[30px] h-[30px] rounded-full border-2 border-accent box-border"></span>
        <span class="text-[11px] text-accent">{s.target}</span>
      </span>
    {/if}
    {#each Array.from({ length: later }, (_, i) => i) as i (i)}
      <span class="flex flex-col items-center gap-1">
        <span class="w-[30px] h-[30px] rounded-full border-[1.5px] border-dashed border-line-chip box-border"></span>
        <span class="text-[11px] text-line-chip">·</span>
      </span>
    {/each}
  </div>
{/if}
