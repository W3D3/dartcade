<script lang="ts">
  export let game: Record<string, unknown>
  export let playerIndex: number
  export let isActive: boolean

  $: targets = game.targets as number[] | undefined
  $: target = targets?.[playerIndex] ?? 1
  $: sequence = (game.sequence as number[] | undefined) ?? Array.from({length: 20}, (_, i) => i + 1)

  // Numbers in the sequence (excluding bull checkpoints 21/22)
  $: regularNums = sequence.filter(n => n <= 20)
  // Bull checkpoint(s) at the end of the sequence
  $: bulls = sequence.filter(n => n > 20)

  // Index of the current target in the sequence (−1 means won)
  $: currentIdx = sequence.indexOf(target)

  function targetLabel(t: number): string {
    if (t > 22) return '✓'
    if (t === 22) return 'Bull'
    if (t === 21) return '25'
    return String(t)
  }

  function tileState(n: number): 'done' | 'current' | 'pending' {
    const idx = sequence.indexOf(n)
    if (idx === -1) return 'pending'
    if (currentIdx === -1) return 'done'   // won
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return 'current'
    return 'pending'
  }
</script>

<div class="flex flex-col py-6 gap-3 flex-1">
  <!-- Current target -->
  <div class="flex items-baseline gap-3">
    <span class="text-8xl font-black tabular-nums leading-none
                 {isActive ? 'text-text' : 'text-[#b4b5aa]'}">
      {targetLabel(target)}
    </span>
  </div>

  <!-- Target progress grid — order follows the sequence -->
  <div class="grid grid-cols-7 gap-1">
    {#each regularNums as n}
      {@const state = tileState(n)}
      <div class="h-7 rounded-[5px] flex items-center justify-center text-[11px] font-bold
                   {state === 'current'
                     ? 'bg-accent text-accent-fg'
                     : state === 'done'
                       ? 'bg-[#242820] text-text-muted'
                       : 'bg-surface-2 text-text-dim border border-line-2'}">
        {n}
      </div>
    {/each}

    {#each bulls as b}
      {@const state = tileState(b)}
      <div class="col-span-2 h-7 rounded-[5px] flex items-center justify-center text-[11px] font-bold
                   {state === 'current'
                     ? 'bg-accent text-accent-fg'
                     : state === 'done'
                       ? 'bg-[#242820] text-text-muted'
                       : 'bg-surface-2 text-text-dim border border-line-2'}">
        {b === 22 ? 'Bull' : '25'}
      </div>
    {/each}
  </div>
</div>
