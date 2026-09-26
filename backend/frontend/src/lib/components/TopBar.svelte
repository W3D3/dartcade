<script lang="ts">
  export let gameId: string = ''
  export let sessionId: string = ''
  export let onClose: () => void = () => {}

  const GAME_LABELS: Record<string, string> = {
    atc: 'Around The Clock',
    x01: '501',
  }

  $: label = GAME_LABELS[gameId] ?? gameId.toUpperCase()
</script>

<div class="flex items-center gap-4 px-4 py-2.5 border-b shrink-0"
  style="background: #111d2e; border-color: rgba(255,255,255,0.06);">

  <button
    on:click={onClose}
    class="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 12L6 8l4-4"/>
    </svg>
    Exit
  </button>

  <div class="w-px h-4 bg-white/10"></div>

  <span class="text-xs font-semibold px-2 py-1 rounded"
    style="background: rgba(59,130,246,0.2); color: #93c5fd;">
    {label}
  </span>

  {#if sessionId}
    <span class="text-xs text-gray-600 font-mono">{sessionId.slice(-6)}</span>
  {/if}
</div>
