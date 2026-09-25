<script lang="ts">
  export let game: Record<string, unknown>
  export let playerIndex: number
  export let isActive: boolean

  $: targets = game.targets as number[] | undefined
  $: target = targets?.[playerIndex] ?? 1

  function targetLabel(t: number): string {
    if (t > 22) return '✓'
    if (t === 22) return 'Bull'
    if (t === 21) return '25'
    return String(t)
  }
</script>

<div class="flex flex-col items-center py-6 gap-3 flex-1">
  <div class="flex items-baseline gap-3">
    <span
      class="text-8xl font-black tabular-nums leading-none"
      class:text-white={isActive}
      class:text-gray-300={!isActive}
    >
      {targetLabel(target)}
    </span>
    <span
      class="text-sm rounded px-2 py-0.5 font-semibold"
      class:bg-black/30={isActive}
      class:text-white/70={isActive}
      class:bg-white/10={!isActive}
      class:text-gray-500={!isActive}
    >
      0
    </span>
  </div>
  <span
    class="text-sm italic"
    class:text-white/50={isActive}
    class:text-gray-600={!isActive}
    title="Stat tracking coming soon"
  >
    Hit% —
  </span>
</div>
