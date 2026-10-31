<script lang="ts">
  // Settings' Profile: your name (handle) checked while typing, and how others see it (Settings
  // board). Saving it changes how friends find you.
  import { Button } from '$lib/components/ui/button/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import NameField from '$lib/components/NameField.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { NAME_HINT, nameSendable, normalizeName, type NameStatus } from '$lib/names'

  const own = $derived($currentUser?.name ?? null)
  let value = $state($currentUser?.name ?? '')
  let status = $state<NameStatus>({ kind: 'empty' })
  let saved = $state('')
  let error = $state('')
  let busy = $state(false)
  const ranked = flag('matchmaking.enabled')
  const changed = $derived(own !== null && normalizeName(value) !== own)
  // The preview follows the field while what's typed could be saved
  const preview = $derived(changed && nameSendable(status) ? normalizeName(value) : (own ?? ''))

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

<section aria-label="Username" class="box-border p-4 md:p-[22px] card flex flex-col gap-[18px]">
  <form
    class="flex flex-col gap-2"
    onsubmit={e => {
      e.preventDefault()
      void save()
    }}
  >
    <NameField id="settings-name" label="Username" bind:value bind:status {own}>
      {#snippet action()}
        <Button type="submit" variant="accent" disabled={busy || !changed || !nameSendable(status)}>Save</Button>
      {/snippet}
    </NameField>
    <span class="text-[13px] leading-[1.5] text-text-dim">{NAME_HINT}</span>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    {#if saved && !changed}<span role="status" class="text-[13px] text-accent">{saved}</span>{/if}
  </form>
  {#if preview}
    <div class="flex flex-col gap-2 px-4 py-[14px] rounded-[12px] bg-surface-1 border border-line">
      <span class="text-[12px] font-semibold label-caps text-text-dim">Preview · how others see you</span>
      <div class="flex items-center gap-3 min-w-0">
        <Avatar name={preview} tone="accent" avatar={$currentUser?.avatar} userId={$currentUser?.id} size={36} />
        <span class="flex flex-col gap-px min-w-0">
          <span class="text-[15px] font-semibold truncate">{preview}</span>
          <span class="font-mono text-[12px] text-accent truncate">@{preview}</span>
        </span>
        <span class="hidden sm:block ml-auto text-[12px] text-text-dim text-right"
          >{$ranked ? 'in friend lists, lobbies and ranked' : 'in friend lists and lobbies'}</span
        >
      </div>
    </div>
  {/if}
  <span class="text-[13px] leading-[1.5] text-text-muted"
    >Friends keep you on their list when you change it. They just see the new name.</span
  >
</section>
