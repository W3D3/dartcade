<script lang="ts">
  // While the lobby's game runs: the way into it.
  import { Button } from '$lib/components/ui/button/index.js'

  let { sessionId, playing }: { sessionId: string; playing: boolean } = $props()
</script>

<div class="flex items-center gap-3 h-12 px-4 rounded-[12px] bg-surface-active border border-accent-line">
  <span class="w-2 h-2 rounded-full bg-live animate-pulse motion-reduce:animate-none"></span>
  <span class="text-[14px] font-semibold">Game running</span>
  <Button variant="accent" class="ml-auto h-9 px-3 text-[13px]" href="#/session/{sessionId}">
    {playing ? 'Back to game' : 'Watch'}
  </Button>
</div>
