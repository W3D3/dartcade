<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'

  export let onUndo: () => void = () => {}
  export let bmRunning: boolean = false
  export let bmStatus: string = ''
  export let onBmAction: (action: 'start' | 'reset' | 'stop') => void = () => {}

  let showBmControls = false
</script>

<div class="flex items-center justify-between px-6 py-3 border-t shrink-0"
  style="background: #111d2e; border-color: rgba(255,255,255,0.06);">

  <!-- Left: BM indicator -->
  <div class="relative">
    <button
      class="flex items-center gap-2 text-sm transition-colors"
      class:text-green-400={bmRunning}
      class:text-gray-600={!bmRunning}
      on:click={() => (showBmControls = !showBmControls)}
      title="Board Manager — click to control"
    >
      <span class="w-2 h-2 rounded-full"
        class:bg-green-400={bmRunning}
        class:bg-gray-700={!bmRunning}
      ></span>
      <span class="text-xs">{bmRunning ? 'Board ready' : 'Board offline'}</span>
      {#if bmStatus}<span class="text-xs text-gray-500 ml-1">{bmStatus}</span>{/if}
    </button>

    {#if showBmControls}
      <div class="absolute bottom-10 left-0 flex gap-2 p-2 rounded-xl shadow-xl"
        style="background: #1e2f47; border: 1px solid rgba(255,255,255,0.1)">
        <button class="text-xs px-3 py-1.5 rounded-lg bg-green-900/60 text-green-300 hover:bg-green-800/60"
          on:click={() => { onBmAction('start'); showBmControls = false }}>Start</button>
        <button class="text-xs px-3 py-1.5 rounded-lg bg-amber-900/60 text-amber-300 hover:bg-amber-800/60"
          on:click={() => { onBmAction('reset'); showBmControls = false }}>Reset</button>
        <button class="text-xs px-3 py-1.5 rounded-lg bg-red-900/60 text-red-300 hover:bg-red-800/60"
          on:click={() => { onBmAction('stop'); showBmControls = false }}>Stop</button>
      </div>
    {/if}
  </div>

  <!-- Right: Undo + Next -->
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" on:click={onUndo}
      class="text-gray-400 hover:text-white hover:bg-white/10">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" class="mr-1.5">
        <path d="M2 8a6 6 0 1 1 1.5 4M2 4v4h4"/>
      </svg>
      Undo
    </Button>

    <Button size="sm"
      class="bg-blue-600 hover:bg-blue-500 text-white font-semibold">
      Next
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" class="ml-1.5">
        <path d="M3 7h8M7 3l4 4-4 4"/>
      </svg>
    </Button>
  </div>
</div>
