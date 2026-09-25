<script lang="ts">
  import type { GameView } from '../gameViews/index.js'
  import { PLAYER_COLORS } from '../constants.js'

  export let player: { name: string }
  export let playerIndex: number
  export let game: Record<string, unknown>
  export let view: GameView
  export let isActive: boolean
  export let isWinner: boolean
  export let previousVisits: number[] = []

  $: color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]
  $: gradient = `linear-gradient(145deg, ${color.from}, ${color.to})`
  $: initial = player.name.trim()[0]?.toUpperCase() ?? '?'
  $: recentVisits = previousVisits.slice(-4)
</script>

<div
  class="rounded-2xl overflow-hidden flex flex-col h-full transition-all duration-300"
  style={isActive ? `background: ${gradient}` : `background: #1a2638;`}
>
  <!-- Header -->
  <div class="flex items-center gap-2 px-4 pt-4 pb-2">
    <div
      class="w-2 h-2 rounded-full shrink-0"
      style={isActive ? 'background: rgba(255,255,255,0.8)' : 'background: #374151'}
    ></div>
    <div
      class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={isActive ? 'background: rgba(0,0,0,0.25); color: white' : 'background: rgba(255,255,255,0.06); color: #6b7280'}
    >
      {initial}
    </div>
    <span
      class="text-sm font-semibold truncate"
      class:text-white={isActive}
      class:text-gray-400={!isActive}
    >
      {player.name}
    </span>
    {#if isWinner}
      <span class="ml-auto text-yellow-400 text-base">🏆</span>
    {/if}
  </div>

  <!-- Game-specific stats slot -->
  <svelte:component
    this={view.PlayerStats}
    {game}
    {playerIndex}
    {isActive}
  />

  <!-- Visit history — last 4 visits in a 2×2 grid -->
  {#if recentVisits.length > 0}
    <div
      class="mt-auto grid grid-cols-2 border-t"
      style="border-color: rgba(255,255,255,0.08)"
    >
      {#each recentVisits as visitTotal, i}
        <div
          class="px-4 py-2 text-center"
          class:border-r={i % 2 === 0}
          class:border-t={i >= 2}
          style="border-color: rgba(255,255,255,0.08)"
        >
          <span
            class="text-sm font-mono tabular-nums"
            class:text-white/70={isActive}
            class:text-gray-600={!isActive}
          >
            {visitTotal}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
