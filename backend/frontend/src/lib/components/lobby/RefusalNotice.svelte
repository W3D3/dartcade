<script lang="ts">
  // Why joining or accepting was refused, with Return to game when your game is still running.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  let { error, sessionId }: { error: string; sessionId: string | null } = $props()
</script>

{#if error}
  <span class="flex flex-wrap items-center gap-3">
    <ErrorText>{error}</ErrorText>
    {#if sessionId}<Button variant="outline" size="sm" href="#/session/{sessionId}" class="px-3 text-[13px]">Return to game</Button>{/if}
  </span>
{/if}
