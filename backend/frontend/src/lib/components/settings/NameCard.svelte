<script lang="ts">
  // Settings: your name (handle), checked while typing; saving it changes how friends find you.
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import NameField from '$lib/components/NameField.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { nameSendable, normalizeName, type NameStatus } from '$lib/names'

  const own = $derived($currentUser?.name ?? null)
  let value = $state($currentUser?.name ?? '')
  let status = $state<NameStatus>({ kind: 'empty' })
  let saved = $state('')
  let error = $state('')
  let busy = $state(false)
  const changed = $derived(own !== null && normalizeName(value) !== own)

  async function save() {
    if (busy || !changed || !nameSendable(status)) return
    busy = true
    error = ''
    try {
      const res = await api.PATCH('/api/me', { body: { name: value } })
      if (res.error) {
        error = res.error.error
        return
      }
      value = res.data.name
      saved = `Saved. Friends find you as @${res.data.name}.`
      await currentUser.refresh()
    } finally {
      busy = false
    }
  }
</script>

<section aria-label="Name" class="flex flex-col gap-4 p-4 md:p-6 rounded-[14px] bg-surface-panel border border-line-2">
  <h2 class="m-0 text-[17px] font-semibold">Name</h2>
  <form
    class="flex flex-col gap-3"
    onsubmit={e => {
      e.preventDefault()
      void save()
    }}
  >
    <NameField id="settings-name" label="Your name" bind:value bind:status {own} />
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    {#if saved && !changed}<span role="status" class="text-[13px] text-accent">{saved}</span>{/if}
    <Button type="submit" variant="accent" disabled={busy || !changed || !nameSendable(status)} class="self-start">Save name</Button>
  </form>
</section>
