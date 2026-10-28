<script lang="ts">
  // Settings' Account: the danger zone. Deletes the profile, boards, friends, lobbies and
  // history; the name stays in match history other players keep (see Settings-DeleteAccount
  // artboard). With mail on, better-auth mails a confirm link and nothing is deleted until it's
  // opened; without mail the account goes at once. An account without a password (Sign in with
  // Discord only) confirms with Discord instead: DeleteWithDiscord.
  import { Trash } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { authClient, currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { canConfirm } from '$lib/deleteAccount'
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

  function openModal() {
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
      const { error: err } = await authClient.deleteUser({ password, callbackURL: '/#/login?deleted=1' })
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
</script>

{#snippet trigger(onopen: () => void)}
  <div class="flex flex-col gap-[10px]">
    <h3 class="m-0 text-[14px] font-semibold text-live-text">Danger zone</h3>
    <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
      Deletes your profile, boards, friends and history. Your name stays in match history other players keep.
    </p>
    <button
      type="button"
      onclick={onopen}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-[10px] border border-danger-line bg-transparent text-live-text
             text-[14px] font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-live-soft"
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
        <h2 class="m-0 font-display font-bold text-[26px] uppercase leading-[1.1] text-live-text">Delete your account?</h2>
        <p class="m-0 text-[14px] text-ink-2">Check your inbox to confirm. Open the link in this browser, where you're signed in.</p>
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
    </DeleteAccountDialog>
  {/if}
{/if}
