<script lang="ts">
  export let game: Record<string, unknown>
  export let playerIndex: number
  export let isActive: boolean
</script>

<div class="p-4 flex-1">
  <p class="text-xs text-yellow-400 mb-2">⚠ Unknown game — raw state:</p>
  <pre class="text-xs text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap"
    >{JSON.stringify({ ...game, playerIndex }, null, 2)}</pre>
</div>
