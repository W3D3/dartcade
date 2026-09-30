<script lang="ts">
  import { nearbyPicks, parseLabel } from '$lib/dartUtils.js'

  let { darts = [], hits, onCorrect, onUndo, ontakeout, showVisitScore = true, bust = false,
        openDart = $bindable(null), popoverHeight = $bindable(0) }: {
    darts: Array<{ label: string; score: number }>
    hits?: boolean[]
    onCorrect: (dartIndex: number, label: string) => void
    onUndo: () => void
    ontakeout?: () => void
    showVisitScore?: boolean
    bust?: boolean
    /** The dart being corrected (bindable, so the board can let it be dragged). */
    openDart?: number | null
    /** Height of the open popover in px, so the page can make room for it. */
    popoverHeight?: number
  } = $props()

  // Close the popover when its dart goes away (undo, takeout)
  $effect(() => { if (openDart !== null && openDart >= darts.length) openDart = null })
  let mode = $state<'quick' | 'full'>('quick')
  let mult = $state<'S' | 'D' | 'T'>('S')

  const visitTotal = $derived(darts.reduce((s, d) => s + d.score, 0))

  const quickPicks = $derived(openDart !== null && darts[openDart]
    ? nearbyPicks(darts[openDart].label)
    : [])

  function pick(dartIndex: number, label: string) {
    onCorrect(dartIndex, label)
    openDart = null
    mode = 'quick'
  }

  function toggle(i: number) {
    if (openDart === i) { openDart = null; mode = 'quick' }
    else { openDart = i; mode = 'quick' }
  }

  const nums = Array.from({length: 20}, (_, i) => i + 1)
  const multNames: Record<string, string> = { S: 'Single', D: 'Double', T: 'Treble' }
</script>

<!-- Dart tiles + visit total -->
<div class="w-full flex gap-2 items-stretch">
  <!-- 3 dart tiles -->
  <div class="flex-1 grid gap-2" style:grid-template-columns="repeat(3, minmax(0, 1fr))">
    {#each [0, 1, 2] as i}
      {#if i < darts.length}
        {@const dart = darts[i]}
        {@const isOpen = openDart === i}
        {@const hitFlag = hits?.[i]}
        {@const isHit = hitFlag === true}
        {@const isMiss = hitFlag === false}
        <button type="button" onclick={() => toggle(i)}
          aria-expanded={isOpen}
          aria-label="Dart {i+1}: {dart.label}, {dart.score} points. Correct this dart"
          class="h-[80px] rounded-[12px] flex flex-col justify-between px-3 py-2 border-0 cursor-pointer
                 {isMiss ? 'bg-[#252820] text-text' : 'bg-accent text-accent-fg'}
                 {isOpen ? '[box-shadow:0_0_0_3px_#0f100e,0_0_0_5px_#c6f24e]' : ''}">
          <div class="flex items-center justify-between w-full">
            <span class="text-[11px] font-semibold tracking-[0.08em] uppercase opacity-60">
              {dart.label}
            </span>
            {#if isHit}
              <span class="text-[10px] font-bold tracking-[0.1em] uppercase opacity-70">HIT</span>
            {:else if isMiss}
              <span class="text-[10px] font-bold tracking-[0.1em] uppercase text-[#6a6e63]">NO HIT</span>
            {/if}
          </div>
          <span class="font-display font-bold text-[40px] leading-none self-end tabular-nums">
            {dart.score}
          </span>
        </button>
      {:else}
        {@const isBustSlot = bust && i >= darts.length}
        <div class="h-[80px] rounded-[12px] border border-dashed flex flex-col items-center justify-center gap-1
                    {isBustSlot
                      ? 'border-[#5a2a24] bg-[#1a0e0c] text-[#7a3a32]'
                      : i === darts.length
                        ? 'border-[#6a6f62] text-[#c9c9bf]'
                        : 'border-[#3e4239] text-[#7d7f74]'}">
          {#if isBustSlot}
            <span class="text-[11px] font-bold uppercase tracking-[0.12em]">Bust</span>
          {:else}
            {#if i === darts.length}
              <span class="w-2 h-2 rounded-full bg-accent"></span>
            {/if}
            <span class="text-[14px]">Dart {i + 1}</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Visit total -->
  {#if showVisitScore}
    <div class="w-[72px] h-[80px] flex-shrink-0 rounded-[12px] flex flex-col items-center justify-center gap-1
                {bust ? 'bg-[#1a0e0c] border border-[#5a2a24]' : 'bg-[#1e2119] border border-[#2e3229]'}">
      <span class="text-[9px] uppercase tracking-[0.12em] font-semibold
                   {bust ? 'text-[#6a3a32]' : 'text-text-dim'}">
        {bust ? 'Bust' : 'Total'}
      </span>
      <span class="font-display font-bold text-[32px] leading-none tabular-nums
                   {bust ? 'text-[#7a3a32]' : 'text-text'}">
        {bust ? 0 : visitTotal}
      </span>
    </div>
  {/if}
</div>

<!-- Popover: compact, below the tiles, so the board above stays free for dragging -->
{#if openDart !== null}
  <div role="dialog" aria-label="Correct dart {openDart + 1}" bind:offsetHeight={popoverHeight}
    class="w-full box-border px-3 pt-2 pb-3 rounded-[14px] bg-[#1f221c] border border-[#454a3f]
           flex flex-col gap-2 [box-shadow:0_16px_40px_rgba(0,0,0,0.5)]">

    <div class="flex items-center gap-2 min-w-0">
      {#if mode === 'full'}
        <button type="button" onclick={() => mode = 'quick'} aria-label="Back to nearby segments"
          class="w-9 h-9 -ml-2 flex-shrink-0 flex items-center justify-center bg-transparent border-0 text-[#c9c9bf] cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6"/>
          </svg>
        </button>
      {/if}
      <span class="text-[14px] font-semibold whitespace-nowrap">Correct dart {openDart + 1}</span>
      <span class="text-[13px] text-text-muted truncate">
        Detected <strong class="text-text">{darts[openDart]?.label}</strong> · or drag it on the board
      </span>
      <button type="button" onclick={() => { openDart = null; mode = 'quick' }}
        aria-label="Close" class="w-9 h-9 -mr-2 ml-auto flex-shrink-0 flex items-center justify-center bg-transparent
               border-0 text-[#c9c9bf] cursor-pointer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
    </div>

    {#if mode === 'quick'}
      <!-- Nearby picks and "Other…" in one row -->
      <div class="grid gap-[6px]" style:grid-template-columns="repeat({quickPicks.length + 1}, minmax(0, 1fr))">
        {#each quickPicks as label}
          <button type="button" onclick={() => pick(openDart!, label)}
            class="h-11 flex flex-col items-center justify-center bg-[#2a2e26]
                   border border-[#3a3f35] rounded-[9px] text-text cursor-pointer">
            <span class="font-display font-bold text-[18px] leading-none">{label}</span>
            <span class="text-[10px] text-text-muted leading-tight">{parseLabel(label).score}</span>
          </button>
        {/each}
        <button type="button" onclick={() => mode = 'full'}
          class="h-11 flex items-center justify-center bg-transparent
                 border border-dashed border-[#5a5e53] rounded-[9px] text-accent text-[13px]
                 font-semibold cursor-pointer">Other…</button>
      </div>

    {:else}
      <!-- Full picker: S/D/T, 1–20 in two rows, then 25 / Bull / Miss -->
      <div class="grid gap-1 p-1 bg-bg rounded-[9px]" style:grid-template-columns="repeat(3, minmax(0, 1fr))">
        {#each (['S', 'D', 'T'] as const) as m}
          <button type="button" onclick={() => mult = m} aria-pressed={mult === m}
            class="h-9 border-0 rounded-[6px] text-[14px] cursor-pointer
                   {mult === m
                     ? 'bg-accent text-accent-fg font-bold'
                     : 'bg-transparent text-[#c9c9bf]'}">
            {multNames[m]}
          </button>
        {/each}
      </div>

      <div class="grid grid-cols-10 gap-1">
        {#each nums as n}
          <button type="button" onclick={() => pick(openDart!, `${mult}${n}`)}
            aria-label="{multNames[mult]} {n}"
            class="h-10 bg-[#2a2e26] border border-[#3a3f35] rounded-[8px] text-text
                   font-display font-bold text-[18px] cursor-pointer">
            {n}
          </button>
        {/each}
      </div>

      <div class="grid grid-cols-3 gap-1">
        <button type="button" onclick={() => pick(openDart!, '25')}
          class="h-10 bg-[#1e3a2b] border border-[#2f5a42] rounded-[8px] text-text
                 text-[14px] font-semibold cursor-pointer">25 · Outer bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Bull')}
          class="h-10 bg-[#4a1f1c] border border-[#6e2e2a] rounded-[8px] text-text
                 text-[14px] font-semibold cursor-pointer">50 · Bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Miss')}
          class="h-10 bg-transparent border border-[#3a3f35] rounded-[8px] text-[#c9c9bf]
                 text-[14px] font-semibold cursor-pointer">Miss · 0</button>
      </div>
    {/if}
  </div>
{/if}

<!-- Hint + actions -->
{#if openDart === null}
  <span class="text-[13px] text-text-dim">
    Tap a dart to correct it, or drag it on the board
  </span>
{/if}

<!-- Pinned to the bottom of the column -->
<div class="w-full flex gap-2 mt-auto">
  <button type="button" onclick={onUndo}
    class="w-[160px] h-[56px] flex items-center justify-center gap-2 border border-line-3
           rounded-[12px] bg-transparent text-text text-[15px] font-medium cursor-pointer">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>
    </svg>
    Undo
  </button>
  {#if ontakeout}
    <button type="button" onclick={ontakeout}
      class="flex-grow h-[56px] border-0 rounded-[12px] bg-text text-accent-fg
             font-display font-bold text-[20px] tracking-widest uppercase cursor-pointer">
      Takeout · next player
    </button>
  {/if}
</div>
