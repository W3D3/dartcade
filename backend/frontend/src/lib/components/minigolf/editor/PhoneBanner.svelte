<!-- The editor isn't made for phones: said once on a phone-sized screen, dismissible, never blocking. -->
<script lang="ts">
  import { X } from '@lucide/svelte'
  import { isPhone } from '$lib/viewport'

  let dismissed = $state(false)
</script>

{#if $isPhone && !dismissed}
  <div role="status" class="m-3 flex items-start gap-2 rounded-md border border-warn-line bg-warn-soft p-3 text-[14px] text-warn">
    <p class="grow">The course editor isn't made for phones; you can still continue.</p>
    <button type="button" aria-label="Dismiss" class="shrink-0 text-warn" onclick={() => (dismissed = true)}><X size={16} /></button>
  </div>
{/if}
