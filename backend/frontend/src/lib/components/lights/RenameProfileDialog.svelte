<script lang="ts">
  // Renames one of the player's light profiles; the server trims the name and refuses one they already use.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'

  let {
    name,
    onsave,
    onclose,
  }: {
    name: string
    /** Resolves to the problem to show, or null once saved. */
    onsave: (name: string) => Promise<string | null>
    onclose: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let value = $state(name)
  let error = $state<string | null>(null)
  let busy = $state(false)
  const trimmed = $derived(value.trim())

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!trimmed || trimmed === name) return onclose()
    busy = true
    error = await onsave(trimmed)
    busy = false
    if (!error) onclose()
  }
</script>

<Modal {onclose} title="Rename profile" subtitle={name} widthClass="max-w-md">
  <form id="rename-light-profile" class="flex flex-col gap-2" onsubmit={e => void save(e)}>
    <label for="light-profile-name" class="text-small font-semibold">Name</label>
    <Input id="light-profile-name" bind:value maxlength={60} autocomplete="off" />
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  </form>
  {#snippet footer()}
    <Button variant="outline" onclick={onclose}>Cancel</Button>
    <Button variant="accent" type="submit" form="rename-light-profile" disabled={busy || !trimmed}>Save</Button>
  {/snippet}
</Modal>
