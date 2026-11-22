<script lang="ts">
  // Settings' Account: the danger zone. Deletes the profile, boards, friends, lobbies and
  // history; the name stays in match history other players keep (see Settings-DeleteAccount
  // artboard). With mail on, better-auth mails a confirm link and nothing is deleted until it's
  // opened; without mail the account goes at once. A player with a passkey can confirm with it
  // instead of the password: a fresh passkey prompt, checked by the server, deletes at once. An
  // account without a password (Sign in with Discord only) confirms with Discord: DeleteWithDiscord.
  import { hrefs } from '$lib/routes'
  import { FingerprintPattern, Trash } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { authClient, currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { canConfirm, canConfirmWithPasskey } from '$lib/deleteAccount'
  import { passkeyFailure } from '$lib/passkeys'
  import DeleteAccountDialog from './DeleteAccountDialog.svelte'
  import DeleteWithDiscord from './DeleteWithDiscord.svelte'

  const name = $derived($currentUser?.name ?? '')
  const passwordless = $derived($currentUser !== null && !$currentUser.signInMethods.includes('password'))

  let open = $state(false)
  let typed = $state('')
  let password = $state('')
  let error = $state('')
  let sent = $state(false)
  let busy = $state(false)
  let hasPasskey = $state(false)

  function openModal() {
    hasPasskey = false
    void authClient.passkey.listUserPasskeys().then(({ data }) => (hasPasskey = Array.isArray(data) && data.length > 0))
    typed = ''
    password = ''
    error = ''
    sent = false
    open = true
  }
  function close() {
    open = false
  }

  function deleted() {
    currentUser.set(null)
    open = false
    void push('/login?deleted=1')
  }

  async function confirm() {
    if (busy || !canConfirm(typed, name, password)) return
    busy = true
    error = ''
    try {
      await authInfo.refresh()
      const { error: err } = await authClient.deleteUser({ password, callbackURL: '/' + hrefs.login('deleted=1') })
      if (err) {
        error = err.message ?? 'Could not delete your account'
        return
      }
      if ($authInfo.mail) {
        sent = true
        return
      }
      deleted()
    } finally {
      busy = false
    }
  }

  async function confirmWithPasskey() {
    if (busy || !canConfirmWithPasskey(typed, name)) return
    busy = true
    error = ''
    try {
      // The passkey prompt, verified by the server, is what the delete call below spends
      const { error: assertion } = await authClient.signIn.passkey()
      if (assertion) {
        const failure = passkeyFailure(assertion, 'Could not confirm with your passkey')
        if (failure.kind === 'error') error = failure.text
        return
      }
      const { error: err } = await authClient.$fetch('/delete-user/passkey', { method: 'POST' })
      if (err) {
        error = err.message ?? 'Could not delete your account'
        return
      }
      deleted()
    } finally {
      busy = false
    }
  }
</script>

{#snippet trigger(onopen: () => void)}
  <div class="flex flex-col gap-[10px]">
    <h3 class="text-[14px] font-semibold text-live-text">Danger zone</h3>
    <p class="text-kicker/normal text-text-dim">
      Deletes your profile, boards, friends and history. Your name stays in match history other players keep.
    </p>
    <button
      type="button"
      onclick={onopen}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-md border border-danger-line text-live-text
 text-[14px] font-semibold cursor-pointer transition-colors hover:bg-live-soft"
    >
      <Trash size={16} />Delete account
    </button>
  </div>
{/snippet}

{#if passwordless}
  <DeleteWithDiscord {trigger} ondeleted={deleted} />
{:else}
  {@render trigger(openModal)}
  {#if open && sent}
    <Modal onclose={close} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[460px]">
      <div class="flex flex-col gap-5">
        <h2 class="font-display font-bold text-[26px] uppercase leading-[1.1] text-live-text">Delete your account?</h2>
        <p class="text-[14px] text-ink-2">Check your inbox to confirm. Open the link in this browser, where you're signed in.</p>
        <div class="flex justify-end">
          <Button variant="outline" onclick={close}>Close</Button>
        </div>
      </div>
    </Modal>
  {:else if open}
    <DeleteAccountDialog onclose={close} onsubmit={() => void confirm()} confirmName={name} bind:typed {error}>
      <div class="flex flex-col gap-2">
        <label for="delete-account-password" class="text-[14px] font-medium text-ink-soft">Password</label>
        <Input id="delete-account-password" type="password" bind:value={password} autocomplete="current-password" placeholder="••••••••" />
      </div>
      {#snippet submit()}
        <Button type="submit" variant="danger" disabled={busy || !canConfirm(typed, name, password)}>Delete account</Button>
      {/snippet}
      {#snippet footer()}
        {#if hasPasskey}
          <div class="flex items-center gap-3 text-[13px] text-text-dim" aria-hidden="true">
            <span class="h-px grow bg-surface-paused"></span>or<span class="h-px grow bg-surface-paused"></span>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !canConfirmWithPasskey(typed, name)}
            onclick={() => void confirmWithPasskey()}
            class="w-full"
          >
            <FingerprintPattern size={16} />Confirm with a passkey
          </Button>
        {/if}
      {/snippet}
    </DeleteAccountDialog>
  {/if}
{/if}
