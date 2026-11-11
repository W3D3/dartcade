<script lang="ts">
  // While the lobby's game runs: the way into it.
  import { hrefs } from '$lib/routes'
  import { Button } from '$lib/components/ui/button/index.js'

  let { sessionId, playing }: { sessionId: string; playing: boolean } = $props()
</script>

<div class="flex items-center gap-3 h-12 px-4 rounded-lg bg-surface-active border border-accent-line">
  <span class="size-2 rounded-full bg-live animate-pulse motion-reduce:animate-none"></span>
  <span class="text-[14px] font-semibold">Game running</span>
  <Button variant="accent" size="sm" class="ml-auto px-3 text-[13px]" href={hrefs.session(sessionId)}>
    {playing ? 'Back to game' : 'Watch'}
  </Button>
</div>
