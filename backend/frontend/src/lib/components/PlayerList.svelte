<script lang="ts">
  export let players: { name: string }[]
  export let targets: number[]
  export let currentPlayer: number
  export let winner: number | null

  function targetLabel(t: number): string {
    if (t === 21) return 'Bull (25)'
    if (t === 22) return 'Bull (50)'
    if (t > 22) return 'Done!'
    return String(t)
  }
</script>

<div class="flex flex-col gap-2">
  {#each players as player, i}
    <div class="flex items-center gap-3 p-3 rounded border
      {currentPlayer === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
      {winner === i ? 'border-yellow-500 bg-yellow-50' : ''}">
      <span class="font-semibold w-32 truncate">{player.name}</span>
      <span class="text-lg font-mono">{targetLabel(targets?.[i] ?? 1)}</span>
      {#if winner === i}<span class="ml-auto text-yellow-600 font-bold">🏆 Winner!</span>{/if}
    </div>
  {/each}
</div>
