<script lang="ts">
  // Asks before deleting one of the player's light profiles: boards using it go back to the built-in one.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'

  let { name, onconfirm, onclose }: { name: string; onconfirm: () => void; onclose: () => void } = $props()
</script>

<Modal {onclose} title="Delete profile?" subtitle={name} widthClass="max-w-md">
  <p class="text-sm text-text-muted">Boards using it go back to the built-in profile. A file you exported from it still imports.</p>
  {#snippet footer()}
    <Button variant="outline" onclick={onclose}>Cancel</Button>
    <Button variant="destructive" onclick={onconfirm}>Delete</Button>
  {/snippet}
</Modal>
