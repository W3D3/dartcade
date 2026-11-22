<script lang="ts">
  // Deleting an account without a password (Sign in with Discord only): it can't confirm with a
  // password or a mailed link, so it signs in with Discord again, comes back here with
  // ?confirmDelete=<its user id> and deletes at once, only if it came back as that same account (DELETE /api/me, auth/deleteGate.ts on the server).
  import type { Snippet } from 'svelte'
  import { get } from 'svelte/store'
  import { push, querystring } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import DiscordMark from '$lib/components/DiscordMark.svelte'
  import { authClient, currentUser } from '$lib/auth'
  import { api } from '$lib/api'
  import { CONFIRM_DELETE, discordReauth } from '$lib/discord'
  import DeleteAccountDialog from './DeleteAccountDialog.svelte'

  let { trigger, ondeleted }: { trigger: Snippet<[() => void]>; ondeleted: () => void } = $props()

  const name = $derived($currentUser?.name ?? '')

  let typed = $state('')
  let error = $state('')
  let busy = $state(false)
  // Back from signing in with Discord again: the dialog opens, and one click deletes, but only the
  // account that asked; another Discord account in this browser comes back as its own user
  const askedBy = new URLSearchParams(get(querystring) ?? '').get(CONFIRM_DELETE)
  const sameAccount = askedBy !== null && askedBy === get(currentUser)?.id
  let reauthed = $state(sameAccount)
  let open = $state(askedBy !== null)
  if (askedBy !== null && !sameAccount)
    error = `You signed in to Discord as another account (@${get(currentUser)?.name}). Nothing was deleted.`

  function openModal() {
    typed = ''
    error = ''
    reauthed = false
    open = true
  }
  function close() {
    open = false
    if (askedBy !== null) void push('/settings/profile')
  }

  async function reauth() {
    if (busy || typed.trim() !== name) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.signIn.social(discordReauth($currentUser?.id ?? ''))
      if (err) error = err.message ?? 'Could not reach Discord'
    } finally {
      busy = false
    }
  }

  async function deleteAccount() {
    if (busy) return
    busy = true
    error = ''
    try {
      const { error: err } = await api.DELETE('/api/me')
      if (err) {
        // Took too long since the sign-in: back to step one
        reauthed = false
        error = err.error
        return
      }
      open = false
      ondeleted()
    } finally {
      busy = false
    }
  }
</script>

{@render trigger(openModal)}

{#if open && reauthed}
  <DeleteAccountDialog onclose={close} onsubmit={() => void deleteAccount()} {error}>
    <p class="text-label/normal text-ink-2">
      You signed in with Discord again as <strong class="text-text">@{name}</strong>. This can't be undone.
    </p>
    {#snippet submit()}
      <Button type="submit" variant="danger" disabled={busy}>Delete account</Button>
    {/snippet}
  </DeleteAccountDialog>
{:else if open}
  <DeleteAccountDialog onclose={close} onsubmit={() => void reauth()} confirmName={name} bind:typed {error}>
    <p class="text-label/normal text-ink-2">Sign in with Discord again to confirm. You'll come back here to delete.</p>
    {#snippet submit()}
      <Button type="submit" variant="danger" disabled={busy || typed.trim() !== name}>
        <DiscordMark size={18} />Sign in with Discord
      </Button>
    {/snippet}
  </DeleteAccountDialog>
{/if}
