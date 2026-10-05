<script lang="ts">
  // A one-time screen for accounts whose name broke the new rules or duplicated an older one.
  // The app stays closed until a name is saved. Spec: "Pick your name".
  import { Button } from '$lib/components/ui/button/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import NameField from '$lib/components/NameField.svelte'
  import { api } from '$lib/api'
  import { currentUser, signOut } from '$lib/auth'
  import { nameSendable, type NameStatus } from '$lib/names'

  let value = $state($currentUser?.suggestedName ?? '')
  let status = $state<NameStatus>({ kind: 'empty' })
  let error = $state('')
  let busy = $state(false)

  async function save() {
    if (busy || !nameSendable(status)) return
    busy = true
    error = ''
    try {
      const res = await api.PATCH('/api/me', { body: { name: value } })
      if (res.error) {
        error = res.error.error
        return
      }
      value = res.data.name
      await currentUser.refresh()
    } finally {
      busy = false
    }
  }
</script>

<div class="flex flex-col md:flex-row min-h-dvh bg-bg">
  <AuthPanel />
  <AuthHero />
  <main class="flex flex-grow md:items-center md:justify-center">
    <form
      onsubmit={e => {
        e.preventDefault()
        void save()
      }}
      class="flex w-full md:w-[400px] flex-col gap-5 md:gap-7 box-border px-5 py-6 md:p-0"
    >
      <div class="flex flex-col gap-2">
        <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] uppercase tracking-[0.02em] leading-none">Pick your name</h1>
        <p class="m-0 text-[16px] text-text-muted">
          Names are unique now, so friends can find you as @name. Yours ({$currentUser?.name}) is taken or uses characters names can't have.
          We suggested one; change it if you like.
        </p>
      </div>
      <NameField id="pick-name" label="Name" bind:value bind:status own={null} />
      {#if error}<ErrorText>{error}</ErrorText>{/if}
      <Button type="submit" variant="primary" disabled={busy || !nameSendable(status)} class="w-full">{busy ? '…' : 'Save name'}</Button>
      <button
        type="button"
        onclick={() => void signOut()}
        class="self-center bg-transparent border-0 text-[15px] text-text-muted cursor-pointer font-[inherit]">Sign out</button
      >
    </form>
  </main>
</div>
