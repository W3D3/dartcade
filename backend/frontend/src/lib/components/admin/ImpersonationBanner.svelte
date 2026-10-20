<!-- Shown on every page while an admin views the app as someone else: who, and the way back. -->
<script lang="ts">
  import { Eye } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { stopViewingAs } from '$lib/admin/impersonate'

  let { name }: { name: string } = $props()
  let error = $state('')
  let busy = $state(false)

  async function stop(): Promise<void> {
    busy = true
    error = ''
    const result = await stopViewingAs()
    busy = false
    if (result) error = result.error
  }
</script>

<div
  role="status"
  class="fixed bottom-4 left-1/2 z-[300] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-warn-line bg-surface-hover px-4 py-2 text-[14px] text-text [box-shadow:0_10px_30px_rgba(0,0,0,0.5)]"
>
  <Eye size={16} class="shrink-0 text-warn" aria-hidden="true" />
  <span class="min-w-0 truncate">Viewing as <strong>{name}</strong></span>
  <Button variant="outline" size="sm" onclick={() => void stop()} disabled={busy}>Stop</Button>
  {#if error}<span role="alert" class="basis-full text-center text-[12px] text-live-text">{error}</span>{/if}
</div>
