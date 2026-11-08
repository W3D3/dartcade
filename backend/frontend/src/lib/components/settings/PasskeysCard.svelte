<script lang="ts">
  // Settings' Passkeys: add a passkey to the account, rename it, remove it. Adding needs a fresh
  // session (the server's rule); a stale one asks for the password once, then goes on.
  import { onMount } from 'svelte'
  import { FingerprintPattern, Pencil, Trash } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import SettingsCard from './SettingsCard.svelte'
  import { authClient, currentUser } from '$lib/auth'
  import {
    passkeyAdded,
    passkeyFailure,
    passkeyLastUsed,
    passkeyName,
    passkeyListSchema,
    passkeysSupported,
    rememberPasskeys,
    type Passkey,
  } from '$lib/passkeys'

  let passkeys = $state<Passkey[] | null>(null)
  let name = $state('')
  let error = $state('')
  let busy = $state(false)
  let confirming = $state(false)
  let password = $state('')
  let renaming = $state<{ id: string; value: string } | null>(null)

  async function load() {
    const { data } = await authClient.passkey.listUserPasskeys()
    const parsed = passkeyListSchema.safeParse(data)
    passkeys = parsed.success ? parsed.data : []
  }
  onMount(load)

  async function add() {
    if (busy) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
      if (err) {
        const failure = passkeyFailure(err, 'Could not add the passkey')
        if (failure.kind === 'stale') confirming = true
        else if (failure.kind === 'error') error = failure.text
        return
      }
      rememberPasskeys()
      name = ''
      await load()
    } finally {
      busy = false
    }
  }

  // A stale session: signing in again makes a fresh one, then the passkey is added
  async function confirmPassword() {
    const email = $currentUser?.email
    if (busy || !email || !password) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.signIn.email({ email, password })
      if (err) {
        error = err.message ?? 'Wrong password'
        return
      }
      password = ''
      confirming = false
    } finally {
      busy = false
    }
    await add()
  }

  async function rename() {
    if (!renaming || busy) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.passkey.updatePasskey({ id: renaming.id, name: renaming.value })
      if (err) {
        error = err.message ?? 'Could not rename the passkey'
        return
      }
      renaming = null
      await load()
    } finally {
      busy = false
    }
  }

  async function remove(p: Passkey) {
    if (busy) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.passkey.deletePasskey({ id: p.id })
      if (err) error = err.message ?? 'Could not remove the passkey'
      else await load()
    } finally {
      busy = false
    }
  }
</script>

<SettingsCard
  id="passkeys-title"
  title="Passkeys"
  description="Sign in with your fingerprint, face or a security key instead of your password."
>
  {#if passkeys && passkeys.length > 0}
    <ul class="flex flex-col" aria-label="Your passkeys">
      {#each passkeys as p (p.id)}
        <li class="flex items-center justify-between gap-3 min-h-14 border-t border-surface-paused">
          {#if renaming?.id === p.id}
            <form
              class="flex flex-grow items-center gap-2"
              onsubmit={e => {
                e.preventDefault()
                void rename()
              }}
            >
              <Input bind:value={renaming.value} aria-label="Passkey name" autocomplete="off" required />
              <Button type="submit" variant="accent" disabled={busy}>Save</Button>
              <Button type="button" variant="outline" onclick={() => (renaming = null)}>Cancel</Button>
            </form>
          {:else}
            <div class="min-w-0 flex flex-col">
              <span class="truncate text-[14px] font-medium text-ink-2">{passkeyName(p)}</span>
              <span class="text-[13px] text-text-dim">{passkeyAdded(p.createdAt)} · {passkeyLastUsed(p.lastUsedAt)}</span>
            </div>
            <div class="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label="Rename {passkeyName(p)}"
                onclick={() => (renaming = { id: p.id, value: passkeyName(p) })}
                class="size-11 flex items-center justify-center rounded-[10px] border-0 text-text-muted cursor-pointer hover:bg-surface-paused"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                aria-label="Remove {passkeyName(p)}"
                disabled={busy}
                onclick={() => void remove(p)}
                class="size-11 flex items-center justify-center rounded-[10px] border-0 text-live-text cursor-pointer hover:bg-live-soft"
              >
                <Trash size={16} />
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if passkeys}
    <p class="text-[14px] text-text-muted">No passkeys yet.</p>
  {/if}

  {#if !passkeysSupported()}
    <p class="text-[14px] text-text-muted">This browser does not support passkeys.</p>
  {:else if confirming}
    <form
      class="flex flex-col gap-2"
      onsubmit={e => {
        e.preventDefault()
        void confirmPassword()
      }}
    >
      <label for="passkey-password" class="text-[14px] font-medium text-ink-soft">Enter your password to add a passkey</label>
      <div class="flex gap-2">
        <Input id="passkey-password" type="password" bind:value={password} autocomplete="current-password" placeholder="••••••••" />
        <Button type="submit" variant="accent" disabled={busy || !password}>Confirm</Button>
      </div>
    </form>
  {:else}
    <form
      class="flex gap-2"
      onsubmit={e => {
        e.preventDefault()
        void add()
      }}
    >
      <Input bind:value={name} aria-label="Name for the new passkey" placeholder="Name (optional)" autocomplete="off" />
      <Button type="submit" variant="accent" disabled={busy} class="shrink-0"><FingerprintPattern size={16} />Add a passkey</Button>
    </form>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
</SettingsCard>
