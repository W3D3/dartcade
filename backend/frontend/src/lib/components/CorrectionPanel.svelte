<script lang="ts">
  import { nearbyPicks, parseLabel } from '$lib/dartUtils.js'

  let { darts = [], hits, onCorrect, onUndo, ontakeout, showVisitScore = true }: {
    darts: Array<{ label: string; score: number }>
    hits?: boolean[]
    onCorrect: (dartIndex: number, label: string) => void
    onUndo: () => void
    ontakeout?: () => void
    showVisitScore?: boolean
  } = $props()

  let openDart = $state<number | null>(null)
  let mode = $state<'quick' | 'full'>('quick')
  let mult = $state<'S' | 'D' | 'T'>('S')

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

<!-- Dart tiles -->
<div class="w-full grid gap-2" style:grid-template-columns={`repeat(3, minmax(0, 1fr))`}>
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
        class="h-[72px] rounded-[12px] flex items-center justify-between px-4 border-0 cursor-pointer
               {isMiss ? 'bg-[#252820] text-text' : 'bg-accent text-accent-fg'}
               {isOpen ? '[box-shadow:0_0_0_3px_#0f100e,0_0_0_5px_#c6f24e]' : ''}">
        <span class="font-display font-bold text-[30px]">{dart.label}</span>
        <div class="flex flex-col items-end gap-[2px]">
          {#if isHit}
            <span class="text-[10px] font-bold tracking-[0.1em] uppercase opacity-70">HIT</span>
            <span class="text-[14px] font-bold">{dart.score} ✓</span>
          {:else if isMiss}
            <span class="text-[10px] font-bold tracking-[0.1em] uppercase text-[#6a6e63]">NO HIT</span>
          {:else}
            <span class="text-[16px] font-bold">{dart.score}</span>
          {/if}
        </div>
      </button>
    {:else}
      <div class="h-[72px] rounded-[12px] border border-dashed
                  {i === darts.length ? 'border-[#6a6f62]' : 'border-[#3e4239]'}
                  flex items-center justify-center gap-2 text-[15px]
                  {i === darts.length ? 'text-[#c9c9bf]' : 'text-[#7d7f74]'}">
        {#if i === darts.length}
          <span class="w-2 h-2 rounded-full bg-accent"></span>
        {/if}
        Dart {i + 1}
      </div>
    {/if}
  {/each}
</div>

<!-- Popover -->
{#if openDart !== null}
  <div role="dialog" aria-label="Correct dart {openDart + 1}"
    class="w-full box-border p-[18px] rounded-[16px] bg-[#1f221c] border border-[#454a3f]
           flex flex-col gap-[14px] [box-shadow:0_24px_60px_rgba(0,0,0,0.55)]">

    <div class="flex justify-between items-start">
      <div class="flex flex-col gap-[2px]">
        <span class="text-[16px] font-semibold">Correct dart {openDart + 1}</span>
        <span class="text-[13px] text-text-muted">
          Detected <strong class="text-text">{darts[openDart]?.label}</strong> ·
          {mode === 'quick' ? 'nearby segments' : 'pick any target'}
        </span>
      </div>
      <button type="button" onclick={() => { openDart = null; mode = 'quick' }}
        aria-label="Close" class="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center bg-transparent
               border-0 text-[#c9c9bf] cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
    </div>

    {#if mode === 'quick'}
      <div class="grid gap-2" style:grid-template-columns="repeat(4, minmax(0, 1fr))">
        {#each quickPicks as label}
          <button type="button" onclick={() => pick(openDart!, label)}
            class="h-[56px] flex flex-col items-center justify-center gap-0 bg-[#2a2e26]
                   border border-[#3a3f35] rounded-[10px] text-text cursor-pointer">
            <span class="font-display font-bold text-[24px] leading-none">{label}</span>
            <span class="text-[12px] text-text-muted">{parseLabel(label).score}</span>
          </button>
        {/each}
        <button type="button" onclick={() => mode = 'full'}
          class="h-[56px] flex flex-col items-center justify-center bg-transparent
                 border border-dashed border-[#5a5e53] rounded-[10px] text-accent text-[14px]
                 font-semibold cursor-pointer">Other…</button>
      </div>

    {:else}
      <!-- Full picker -->
      <div class="flex items-center">
        <button type="button" onclick={() => mode = 'quick'}
          class="h-10 flex items-center gap-[6px] px-1 bg-transparent border-0
                 text-[#c9c9bf] text-[14px] cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6"/>
          </svg>
          Nearby
        </button>
      </div>

      <!-- S/D/T toggle -->
      <div class="grid gap-1 p-1 bg-bg rounded-[10px]" style:grid-template-columns="repeat(3, minmax(0, 1fr))">
        {#each (['S', 'D', 'T'] as const) as m}
          <button type="button" onclick={() => mult = m} aria-pressed={mult === m}
            class="h-11 border-0 rounded-[7px] text-[15px] cursor-pointer
                   {mult === m
                     ? 'bg-accent text-accent-fg font-bold'
                     : 'bg-transparent text-[#c9c9bf]'}">
            {multNames[m]}
          </button>
        {/each}
      </div>

      <!-- 1–20 grid -->
      <div class="grid grid-cols-5 gap-[6px]">
        {#each nums as n}
          <button type="button" onclick={() => pick(openDart!, `${mult}${n}`)}
            aria-label="{multNames[mult]} {n}"
            class="h-12 bg-[#2a2e26] border border-[#3a3f35] rounded-[9px] text-text
                   font-display font-bold text-[22px] cursor-pointer">
            {n}
          </button>
        {/each}
      </div>

      <!-- Special targets -->
      <div class="grid grid-cols-3 gap-[6px]">
        <button type="button" onclick={() => pick(openDart!, '25')}
          class="h-12 bg-[#1e3a2b] border border-[#2f5a42] rounded-[9px] text-text
                 text-[15px] font-semibold cursor-pointer">25 · Outer bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Bull')}
          class="h-12 bg-[#4a1f1c] border border-[#6e2e2a] rounded-[9px] text-text
                 text-[15px] font-semibold cursor-pointer">50 · Bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Miss')}
          class="h-12 bg-transparent border border-[#3a3f35] rounded-[9px] text-[#c9c9bf]
                 text-[15px] font-semibold cursor-pointer">Miss · 0</button>
      </div>
    {/if}
  </div>
{/if}

<!-- Hint + actions -->
<span class="text-[13px] text-text-dim">
  Tap a dart to correct it{#if showVisitScore} · Visit so far <strong class="text-text">{darts.reduce((s, d) => s + d.score, 0)}</strong>{/if}
</span>

<div class="w-full flex gap-2">
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
