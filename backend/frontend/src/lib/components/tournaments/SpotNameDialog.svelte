<script lang="ts">
  // A name to type: a player added or renamed on the organizer page, a device's in tournament mode.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { SPOT_NAME_MAX } from '$shared/tournaments/participants'

  let {
    title,
    subtitle,
    name = '',
    max = SPOT_NAME_MAX,
    onsave,
    onclose,
  }: { title: string; subtitle?: string; name?: string; max?: number; onsave: (name: string) => void; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(name)
</script>

<Modal {title} {subtitle} {onclose} widthClass="md:max-w-sm">
  <form
    id="spot-name"
    onsubmit={e => {
      e.preventDefault()
      if (value.trim()) onsave(value)
    }}
  >
    <label class="flex flex-col gap-1.5">
      <span class="field-label">Name</span>
      <Input bind:value maxlength={max} autofocus />
    </label>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button variant="accent" type="submit" form="spot-name" disabled={!value.trim()}>Save</Button>
  {/snippet}
</Modal>
