<script lang="ts">
  export let game: Record<string, unknown>
  export let playerIndex: number
  export let isActive: boolean

  $: targets = game.targets as number[] | undefined
  $: target = targets?.[playerIndex] ?? 1

  const nums = Array.from({length: 20}, (_, i) => i + 1)

  function targetLabel(t: number): string {
    if (t > 22) return '✓'
    if (t === 22) return 'Bull'
    if (t === 21) return '25'
    return String(t)
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

  <!-- Target progress grid -->
  <div class="grid grid-cols-7 gap-1">
    {#each nums as n}
      {@const done = n < target}
      {@const current = n === target}
      <div class="h-7 rounded-[5px] flex items-center justify-center text-[11px] font-bold
                   {current
                     ? 'bg-accent text-accent-fg'
                     : done
                       ? 'bg-[#242820] text-text-muted'
                       : 'bg-surface-2 text-text-dim border border-line-2'}">
        {n}
      </div>
    {/each}
    <!-- 25 / Bull -->
    <div class="h-7 rounded-[5px] flex items-center justify-center text-[11px] font-bold
                 {target === 21
                   ? 'bg-accent text-accent-fg'
                   : target > 21
                     ? 'bg-[#242820] text-text-muted'
                     : 'bg-surface-2 text-text-dim border border-line-2'}">25</div>
    <div class="col-span-2 h-7 rounded-[5px] flex items-center justify-center text-[11px] font-bold
                 {target === 22
                   ? 'bg-accent text-accent-fg'
                   : target > 22
                     ? 'bg-[#242820] text-text-muted'
                     : 'bg-surface-2 text-text-dim border border-line-2'}">Bull</div>
  </div>
</div>
