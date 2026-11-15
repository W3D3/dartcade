<script lang="ts">
  // Leave tournament mode? (Tournament-Mode-Exit): the device goes back to the app; a match it
  // plays is paused, and any device in tournament mode can continue it.
  import { CirclePause, Info } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'

  let { playing, onleave, onclose }: { playing: string | null; onleave: () => void; onclose: () => void } = $props()
</script>

<Modal title="Leave tournament mode?" {onclose} widthClass="md:max-w-md">
  <p class="text-body text-ink-2">
    This device goes back to the normal Dartcade app. The tournament keeps running on the other devices, and you can open tournament mode
    here again at any time.
  </p>
  <p class="flex items-start gap-2.5 rounded-lg bg-surface-chip p-3 text-label text-ink-2">
    {#if playing}
      <CirclePause size={18} class="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      {playing} is running on this device. Leaving pauses it, and any device in tournament mode can continue it.
    {:else}
      <Info size={18} class="mt-0.5 shrink-0" aria-hidden="true" />
      No match is running on this device right now.
    {/if}
  </p>
  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Stay in tournament mode</Button>
    <Button variant="accent" onclick={onleave}>{playing ? 'Pause and leave' : 'Leave'}</Button>
  {/snippet}
</Modal>
