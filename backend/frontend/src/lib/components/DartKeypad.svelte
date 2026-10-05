<script lang="ts">
  // Manual dart entry (phone and desktop, same placement): multiplier tabs with bull and outer
  // bull, 1–20 in a tight 5×4 grid (doubles and trebles show what each key scores), then undo · miss · next,
  // all within the height it's given. Roomier from md up.
  import { ChevronRight, Undo2 } from '@lucide/svelte'
  import type { Segment } from '$lib/api/game-ws'
  import { keypadPick, type Mult } from '$lib/keypad'

  let {
    onDart,
    dartCount,
    locked,
    canUndo,
    onUndo,
    nextLabel,
    nextEnabled,
    nextProminent,
    onNext,
    replacing = null,
    disabled = false,
  }: {
    onDart: (seg: Segment) => void
    dartCount: number
    /** The visit is over (bust, checkout, win). */
    locked: boolean
    canUndo: boolean
    onUndo: () => void
    nextLabel: string
    nextEnabled: boolean
    nextProminent: boolean
    onNext: () => void
    /** A thrown dart is selected (0-based): the next key replaces it instead of adding a dart. */
    replacing?: number | null
    /** Not this viewer's turn (online): every key is off. */
    disabled?: boolean
  } = $props()

  let mult = $state<Mult>(1)

  const full = $derived(disabled || (replacing === null && (locked || dartCount >= 3)))
  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
  const MULTS = [
    { m: 1, label: 'Single', short: 'S' },
    { m: 2, label: 'Double', short: 'D' },
    { m: 3, label: 'Treble', short: 'T' },
  ] as const

  function pick(number: number) {
    if (full) return
    const next = keypadPick(number, mult)
    onDart(next.dart)
    mult = next.mult
  }

  function special(seg: Segment) {
    if (!full) onDart(seg)
  }

  const cell = 'bg-surface-panel border-0 font-[inherit] cursor-pointer disabled:cursor-not-allowed'
</script>

<div
  class="h-full min-h-0 grid grid-rows-[48px_minmax(0,1fr)_48px] md:grid-rows-[64px_minmax(0,1fr)_64px] gap-px bg-line-2 border border-line-2 rounded-[12px] md:rounded-[14px] overflow-hidden select-none"
>
  <!-- Multiplier tabs, bull, outer bull -->
  <div class="grid grid-cols-5 gap-px">
    {#each MULTS as o (o.m)}
      <button
        type="button"
        onclick={() => (mult = o.m)}
        aria-pressed={mult === o.m}
        class="{cell} relative text-[14px] md:text-[17px] font-semibold {mult === o.m ? 'text-text' : 'text-text-muted'}"
      >
        {o.label}
        {#if mult === o.m}<span class="absolute left-0 right-0 bottom-0 h-[3px] bg-accent" aria-hidden="true"></span>{/if}
      </button>
    {/each}
    <button
      type="button"
      disabled={full}
      aria-label="Bull, 50"
      onclick={() => special({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 })}
      class="{cell} flex flex-col items-center justify-center leading-tight text-text disabled:opacity-40"
    >
      <span class="text-[13px] md:text-[16px] font-semibold">Bull</span><span class="text-[12px] md:text-[14px] text-text-muted">50</span>
    </button>
    <button
      type="button"
      disabled={full}
      aria-label="Outer bull, 25"
      onclick={() => special({ name: '25', number: 25, bed: 'Single', multiplier: 1 })}
      class="{cell} flex flex-col items-center justify-center leading-tight text-text disabled:opacity-40"
    >
      <span class="text-[13px] md:text-[16px] font-semibold">Outer</span><span class="text-[12px] md:text-[14px] text-text-muted">25</span>
    </button>
  </div>

  <!-- 1–20 -->
  <div class="grid grid-cols-5 grid-rows-4 gap-px min-h-0">
    {#each nums as n (n)}
      <button
        type="button"
        onclick={() => pick(n)}
        disabled={full}
        aria-label="{MULTS[mult - 1].label} {n}"
        class="{cell} min-h-0 flex items-center justify-center text-text disabled:opacity-40 active:bg-surface-key"
      >
        <!-- The number is centred; a double's or treble's score hangs off to its right -->
        <span class="relative font-display font-bold text-[28px] md:text-[38px] leading-none"
          >{n}{#if mult > 1}<span
              class="absolute left-full bottom-[2px] ml-[3px] font-sans font-normal text-[12px] md:text-[15px] tabular-nums text-accent"
              >{n * mult}</span
            >{/if}</span
        >
      </button>
    {/each}
  </div>

  <!-- Undo · Miss · Next -->
  <div class="grid grid-cols-[1fr_1.2fr_1.3fr] gap-px">
    <button
      type="button"
      onclick={onUndo}
      disabled={!canUndo}
      aria-label="Undo last dart"
      class="{cell} flex items-center justify-center text-text disabled:opacity-40"
    >
      <Undo2 size={22} class="md:size-[26px]" />
    </button>
    <button
      type="button"
      disabled={full}
      aria-label="Miss"
      onclick={() => special({ name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 })}
      class="{cell} font-display font-bold text-[24px] md:text-[30px] uppercase tracking-[0.04em] text-text disabled:opacity-40"
    >
      Miss
    </button>
    <button
      type="button"
      onclick={onNext}
      disabled={!nextEnabled}
      class="border-0 font-[inherit] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-1 px-1 whitespace-nowrap text-[13px] md:text-[16px] font-semibold
             {nextProminent ? 'bg-accent text-accent-fg' : 'bg-surface-panel text-text-muted'}"
    >
      {nextLabel}<ChevronRight size={16} />
    </button>
  </div>
</div>
