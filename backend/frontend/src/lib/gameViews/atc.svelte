<script lang="ts">
  import type { PlayerStatsProps } from './index.js'

  let { game, playerIndex, isActive, compact = false }: PlayerStatsProps = $props()

  const targets    = $derived(game.targets as number[] | undefined)
  const target     = $derived(targets?.[playerIndex] ?? 1)
  const sequence   = $derived((game.sequence as number[] | undefined) ?? Array.from({length: 20}, (_, i) => i + 1))
  const hitCounts  = $derived(game.hitCounts as number[] | undefined)
  const hitCount   = $derived(hitCounts?.[playerIndex] ?? 0)
  const totalDarts = $derived((game.totalDarts as number[] | undefined)?.[playerIndex] ?? 0)

  const regularNums      = $derived(sequence.filter((n: number) => n <= 20))
  const bulls            = $derived(sequence.filter((n: number) => n > 20))
  const currentIdx       = $derived(sequence.indexOf(target))
  const totalInSequence  = $derived(sequence.length)
  const doneCount        = $derived(currentIdx === -1 ? totalInSequence : currentIdx)
  const hitRate          = $derived(totalDarts > 0 ? Math.round(hitCount / totalDarts * 100) : 0)

  function targetLabel(t: number): string {
    if (t > 22) return 'Bull'
    if (t === 22) return 'Bull'
    if (t === 21) return '25'
    return String(t)
  }

  function tileState(n: number): 'done' | 'current' | 'pending' {
    const idx = sequence.indexOf(n)
    if (idx === -1) return 'pending'
    if (currentIdx === -1) return 'done'
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return 'current'
    return 'pending'
  }
</script>

{#if compact}
  <!-- Compact layout for multi-player rows -->
  <div class="flex flex-col gap-[10px] min-w-0">
    <div class="flex flex-wrap gap-[5px]">
      {#each regularNums as n (n)}
        {@const state = tileState(n)}
        <div class="min-w-[36px] h-[40px] px-[6px] rounded-[9px] flex items-center justify-center text-[14px] font-bold
                    {state === 'done'
                      ? (isActive ? 'bg-accent text-accent-fg' : 'bg-[#3a4a2e] text-[#8da07a]')
                      : state === 'current'
                        ? (isActive
                            ? 'border-2 border-accent text-accent bg-transparent'
                            : 'border-2 border-dashed border-[#5a5e55] text-[#7a7e75] bg-transparent')
                        : (isActive ? 'bg-[#252920] text-[#5a5e55]' : 'bg-[#1e211a] text-[#4a4e45]')}">
          {n}
        </div>
      {/each}
      {#each bulls as b (b)}
        {@const state = tileState(b)}
        <div class="min-w-[42px] h-[40px] px-[8px] rounded-[9px] flex items-center justify-center text-[14px] font-bold
                    {state === 'done'
                      ? (isActive ? 'bg-accent text-accent-fg' : 'bg-[#3a4a2e] text-[#8da07a]')
                      : state === 'current'
                        ? (isActive
                            ? 'border-2 border-accent text-accent bg-transparent'
                            : 'border-2 border-dashed border-[#5a5e55] text-[#7a7e75] bg-transparent')
                        : (isActive ? 'bg-[#252920] text-[#5a5e55]' : 'bg-[#1e211a] text-[#4a4e45]')}">
          {b === 22 ? 'B' : '25'}
        </div>
      {/each}
    </div>
    <div class="flex gap-6 text-[14px] {isActive ? 'text-text-muted' : 'text-[#5a5e55]'}">
      <span>Darts <strong class="font-bold {isActive ? 'text-text' : 'text-[#7a7e75]'}">{totalDarts}</strong></span>
      <span>Hit rate <strong class="font-bold {isActive ? 'text-text' : 'text-[#7a7e75]'}">{hitRate}%</strong></span>
    </div>
  </div>

{:else}
  <!-- Full vertical layout for 2-player card -->
  <div class="flex flex-col flex-1 min-h-0 py-1 gap-[6px]">
    <span class="text-[11px] tracking-[0.14em] uppercase font-semibold mt-2
                 {isActive ? 'text-text-muted' : 'text-text-dim'}">
      Target
    </span>

    <div class="font-display font-black leading-none tracking-tight
                text-[clamp(64px,10vw,160px)]
                {isActive ? 'text-accent' : 'text-[#5a5e55]'}">
      {targetLabel(target)}
    </div>

    <span class="text-[13px] {isActive ? 'text-text-muted' : 'text-[#5a5e55]'}">
      {doneCount} of {totalInSequence} done
    </span>

    <div class="grid grid-cols-7 gap-[4px] mt-1">
      {#each regularNums as n (n)}
        {@const state = tileState(n)}
        <div class="h-[30px] rounded-[5px] flex items-center justify-center text-[11px] font-bold
                    {state === 'done'
                      ? (isActive ? 'bg-accent text-accent-fg' : 'bg-[#36402e] text-[#8da07a]')
                      : state === 'current'
                        ? (isActive
                            ? 'border-2 border-accent text-accent bg-transparent'
                            : 'border border-dashed border-[#5a5e55] text-[#7a7e75] bg-transparent')
                        : (isActive ? 'bg-[#1e2119] text-[#4a4e45]' : 'bg-[#191b17] text-[#3a3e35]')}">
          {n}
        </div>
      {/each}

      {#each bulls as b (b)}
        {@const state = tileState(b)}
        <div class="col-span-2 h-[30px] rounded-[5px] flex items-center justify-center text-[11px] font-bold
                    {state === 'done'
                      ? (isActive ? 'bg-accent text-accent-fg' : 'bg-[#36402e] text-[#8da07a]')
                      : state === 'current'
                        ? (isActive
                            ? 'border-2 border-accent text-accent bg-transparent'
                            : 'border border-dashed border-[#5a5e55] text-[#7a7e75] bg-transparent')
                        : (isActive ? 'bg-[#1e2119] text-[#4a4e45]' : 'bg-[#191b17] text-[#3a3e35]')}">
          {b === 22 ? 'Bull' : '25'}
        </div>
      {/each}
    </div>

    <div class="mt-auto pt-3 flex gap-5 text-[13px] {isActive ? 'text-text-muted' : 'text-[#5a5e55]'}">
      <span>Darts <strong class="font-bold {isActive ? 'text-text' : 'text-[#7a7e75]'}">{totalDarts}</strong></span>
      <span>Hit rate <strong class="font-bold {isActive ? 'text-text' : 'text-[#7a7e75]'}">{hitRate}%</strong></span>
    </div>
  </div>
{/if}
