<script lang="ts">
  // Add a player, or rename a guest one, on the organizer page.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { SPOT_NAME_MAX } from '$shared/tournaments/participants'

  let {
    title,
    name = '',
    onsave,
    onclose,
  }: { title: string; name?: string; onsave: (name: string) => void; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(name)
</script>

<Modal {title} {onclose} widthClass="md:max-w-sm">
  <form
    id="spot-name"
    onsubmit={e => {
      e.preventDefault()
      if (value.trim()) onsave(value)
    }}
  >
    <label class="flex flex-col gap-1.5">
      <span class="field-label">Name</span>
      <Input bind:value maxlength={SPOT_NAME_MAX} autofocus />
    </label>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button variant="accent" type="submit" form="spot-name" disabled={!value.trim()}>Save</Button>
  {/snippet}
</Modal>
