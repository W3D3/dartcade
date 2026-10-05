<script lang="ts">
  import { ChevronLeft, X } from '@lucide/svelte'
  // The three dart slots; tapping a thrown dart opens the correction popover below them.
  import { nearbyPicks, parseLabel } from '$lib/dartUtils.js'
  import type { Slot } from '$lib/dartSlots.js'

  let {
    slots,
    onCorrect,
    popIndex = null,
    openDart = $bindable(null),
    showPopover = true,
    popoverAbove = false,
  }: {
    slots: Slot[]
    onCorrect: (dartIndex: number, label: string) => void
    /** Slot of a dart that just landed big (≥ 50): it pops once. */
    popIndex?: number | null
    /** The dart being corrected (bindable, so the board can highlight it). */
    openDart?: number | null
    /** Off: tapping a dart only selects it (the phone keypad then replaces it). */
    showPopover?: boolean
    /**
     * Open the picker as an overlay above the slots, as wide as the nearest positioned
     * ancestor (phones: over the board, where there's room).
     */
    popoverAbove?: boolean
  } = $props()

  let mode = $state<'quick' | 'full'>('quick')
  let mult = $state<'S' | 'D' | 'T'>('S')

  const isThrown = (s: Slot | undefined) => s?.kind === 'thrown' || s?.kind === 'miss'

  // Close the popover when its dart goes away (undo, takeout)
  $effect(() => {
    if (openDart !== null && !isThrown(slots[openDart])) openDart = null
  })

  // Move focus into the popover when it opens
  let popover: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (openDart !== null) popover?.querySelector<HTMLElement>('button')?.focus()
  })

  const quickPicks = $derived(openDart !== null ? nearbyPicks(slots[openDart]?.label ?? 'Miss') : [])

  function toggle(i: number) {
    mode = 'quick'
    openDart = openDart === i ? null : i
  }
  // Give focus back to the dart's slot before the popover (which holds it) goes away
  let slotRow: HTMLDivElement | undefined = $state()
  function close() {
    if (openDart !== null) slotRow?.querySelectorAll<HTMLElement>('button')[openDart]?.focus()
    openDart = null
    mode = 'quick'
  }
  function pick(label: string) {
    if (openDart === null) return
    onCorrect(openDart, label)
    close()
  }

  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
  const multNames: Record<string, string> = { S: 'Single', D: 'Double', T: 'Treble' }
  // Phones: 58 px slots per Mobile-Match; desktop as before
  const slotBox =
    'h-[58px] md:h-[min(124px,14vh)] box-border rounded-[12px] md:rounded-[14px] px-1 md:px-[14px] py-1 md:pt-[10px] md:pb-3 flex flex-col items-center justify-center gap-[2px] md:gap-2'
  const slotLabel = 'font-display font-bold text-[26px] md:text-[min(66px,7.5vh)] leading-[0.9]'
</script>

<svelte:window
  onkeydown={(e: KeyboardEvent) => {
    if (e.key === 'Escape' && openDart !== null) close()
  }}
/>

<div class="flex flex-col gap-2 min-w-0">
  <div bind:this={slotRow} class="grid grid-cols-3 gap-[10px]">
    {#each slots as slot, i (i)}
      {#if slot.kind === 'thrown' || slot.kind === 'miss'}
        <button
          type="button"
          onclick={() => toggle(i)}
          aria-expanded={openDart === i}
          aria-label={slot.aria}
          class="{slotBox} cursor-pointer
                 {slot.kind === 'thrown' ? 'bg-accent text-accent-fg border-0' : 'bg-surface-chip text-text border border-line-key'}
                 {openDart === i ? '[box-shadow:0_0_0_3px_var(--color-bg),0_0_0_5px_var(--color-accent)]' : ''}"
          class:fx-pop={popIndex === i}
        >
          <span class={slotLabel}>{slot.label}</span>
          <span class="font-display font-bold text-[14px] md:text-[30px] leading-none {slot.kind === 'miss' ? 'text-text-muted' : ''}"
            >{slot.points}</span
          >
        </button>
      {:else}
        <div
          class="{slotBox}
                    {slot.kind === 'bust'
            ? 'bg-[#1a0e0c] border border-danger-line'
            : slot.kind === 'suggested-next' || slot.kind === 'empty-next'
              ? 'border-2 border-dashed border-accent'
              : slot.kind === 'suggested-later'
                ? 'border-[1.5px] border-dashed border-line-next'
                : 'border-[1.5px] border-dashed border-line-dashed'}"
        >
          <span class="sr-only">{slot.aria}</span>
          {#if slot.kind === 'bust'}
            <span aria-hidden="true" class="text-[13px] font-bold uppercase tracking-[0.12em] text-danger-text">{slot.label}</span>
          {:else if slot.kind === 'empty-next'}
            <span aria-hidden="true" class="w-3 h-3 rounded-full bg-accent"></span>
          {:else if slot.label}
            <span aria-hidden="true" class="{slotLabel} text-text-dim">{slot.label}</span>
            <span
              aria-hidden="true"
              class="text-[10px] md:text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-faint truncate max-w-full"
              >{slot.foot}</span
            >
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if openDart !== null && showPopover}
    <div
      bind:this={popover}
      role="dialog"
      aria-label="Correct dart {openDart + 1}"
      class="{popoverAbove
        ? 'absolute left-0 right-0 bottom-full mb-2 z-30'
        : 'w-full'} box-border px-3 pt-2 pb-3 rounded-[14px] bg-surface-inset border border-line-popover
             flex flex-col gap-2 [box-shadow:0_16px_40px_rgba(0,0,0,0.5)]"
    >
      <div class="flex items-center gap-2 min-w-0">
        {#if mode === 'full'}
          <button
            type="button"
            onclick={() => (mode = 'quick')}
            aria-label="Back to nearby segments"
            class="w-9 h-9 -ml-2 shrink-0 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        {/if}
        <span class="text-[14px] font-semibold whitespace-nowrap">Correct dart {openDart + 1}</span>
        <span class="text-[13px] text-text-muted truncate">
          Detected <strong class="text-text">{slots[openDart]?.label}</strong> · or drag it on the board
        </span>
        <button
          type="button"
          onclick={close}
          aria-label="Close"
          class="w-9 h-9 -mr-2 ml-auto shrink-0 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {#if mode === 'quick'}
        <div class="grid gap-[6px]" style:grid-template-columns="repeat({quickPicks.length + 1}, minmax(0, 1fr))">
          {#each quickPicks as label (label)}
            <button
              type="button"
              onclick={() => pick(label)}
              class="h-11 flex flex-col items-center justify-center bg-surface-key border border-line-key rounded-[9px] text-text cursor-pointer"
            >
              <span class="font-display font-bold text-[18px] leading-none">{label}</span>
              <span class="text-[10px] text-text-muted leading-tight">{parseLabel(label).score}</span>
            </button>
          {/each}
          <button
            type="button"
            onclick={() => (mode = 'full')}
            class="h-11 flex items-center justify-center bg-transparent border-[1.5px] border-dashed border-line-pip rounded-[9px]
                   text-accent text-[13px] font-semibold cursor-pointer">Other…</button
          >
        </div>
      {:else}
        <div class="grid grid-cols-3 gap-1 p-1 bg-bg rounded-[9px]">
          {#each ['S', 'D', 'T'] as const as m (m)}
            <button
              type="button"
              onclick={() => (mult = m)}
              aria-pressed={mult === m}
              class="h-9 border-0 rounded-[6px] text-[14px] cursor-pointer
                     {mult === m ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">{multNames[m]}</button
            >
          {/each}
        </div>
        <div class="grid grid-cols-10 gap-1">
          {#each nums as n (n)}
            <button
              type="button"
              onclick={() => pick(`${mult}${n}`)}
              aria-label="{multNames[mult]} {n}"
              class="h-10 bg-surface-key border border-line-key rounded-[8px] text-text font-display font-bold text-[18px] cursor-pointer"
              >{n}</button
            >
          {/each}
        </div>
        <div class="grid grid-cols-3 gap-1">
          <button
            type="button"
            onclick={() => pick('25')}
            class="h-10 bg-[#1e3a2b] border border-[#2f5a42] rounded-[8px] text-text text-[14px] font-semibold cursor-pointer"
            >25 · Outer bull</button
          >
          <button
            type="button"
            onclick={() => pick('Bull')}
            class="h-10 bg-[#4a1f1c] border border-[#6e2e2a] rounded-[8px] text-text text-[14px] font-semibold cursor-pointer"
            >50 · Bull</button
          >
          <button
            type="button"
            onclick={() => pick('Miss')}
            class="h-10 bg-transparent border border-line-key rounded-[8px] text-ink-2 text-[14px] font-semibold cursor-pointer"
            >Miss · 0</button
          >
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fx-pop {
    animation: dc-pop 2.4s ease-out 1;
  }
  @keyframes dc-pop {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0.35);
    }
    12% {
      transform: scale(1.08);
      box-shadow: 0 0 0 10px rgba(198, 242, 78, 0.35);
    }
    40%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 18px rgba(198, 242, 78, 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-pop {
      animation: none;
    }
  }
</style>
