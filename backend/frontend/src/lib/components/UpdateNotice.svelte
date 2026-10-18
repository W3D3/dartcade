<script lang="ts">
  // "dartcade was updated": the server runs a newer build than this tab (checked once per app load, see lib/version.ts)
  import { Toast } from '$lib/components/ui/toast/index.js'
  import { SPA_BUILD, isStale, serverVersion, updateDismissed } from '$lib/version'
</script>

{#if !$updateDismissed && isStale(SPA_BUILD, $serverVersion)}
  <Toast actionLabel="Reload" onaction={() => location.reload()} onclose={() => updateDismissed.set(true)}
    >dartcade was updated — reload</Toast
  >
{/if}
