<script lang="ts">
  // Settings' Account: the danger zone. Deletes the profile, boards, friends, lobbies and
  // history; the name stays in match history other players keep (see Settings-DeleteAccount
  // artboard). With mail on, better-auth mails a confirm link and nothing is deleted until it's
  // opened; without mail the account goes at once. An account without a password (Sign in with
  // Discord only) confirms by signing in with Discord again instead, then deletes at once
  // (auth/deleteGate.ts on the server).
  import { get } from 'svelte/store'
  import { Trash } from '@lucide/svelte'
  import { push, querystring } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import DiscordMark from '$lib/components/DiscordMark.svelte'
  import { authClient, currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { canConfirm } from '$lib/deleteAccount'
  import { CONFIRM_DELETE, discordReauth } from '$lib/discord'

  const name = $derived($currentUser?.name ?? '')
  const passwordless = $derived($currentUser !== null && !$currentUser.signInMethods.includes('password'))

  let typed = $state('')
  let password = $state('')
  let error = $state('')
  let sent = $state(false)
  let busy = $state(false)
  // Back from signing in with Discord again: the modal opens, and one click deletes
  const returned = new URLSearchParams(get(querystring) ?? '').get(CONFIRM_DELETE) === '1'
  let reauthed = $state(returned)
  let open = $state(returned)

  function openModal() {
    typed = ''
    password = ''
    error = ''
    sent = false
    reauthed = false
    open = true
  }
  function close() {
    open = false
    if (reauthed) void push('/settings/profile')
  }

  async function reauth() {
    if (busy || typed.trim() !== name) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.signIn.social(discordReauth())
      if (err) error = err.message ?? 'Could not reach Discord'
    } finally {
      busy = false
    }
  }

  function deleted() {
    currentUser.set(null)
    open = false
    void push('/login?deleted=1')
  }

  async function deleteReauthed() {
    if (busy) return
    busy = true
    error = ''
    try {
      const { error: err } = await authClient.deleteUser({})
      if (err) {
        // Took too long since the sign-in: back to step one
        reauthed = false
        error = err.message ?? 'Could not delete your account'
        return
      }
      deleted()
    } finally {
      busy = false
    }
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

<div class="flex flex-col gap-[10px]">
  <h3 class="m-0 text-[14px] font-semibold text-live-text">Danger zone</h3>
  <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
    Deletes your profile, boards, friends and history. Your name stays in match history other players keep.
  </p>
  <button
    type="button"
    onclick={openModal}
    class="self-start h-11 px-4 flex items-center gap-2 rounded-[10px] border border-danger-line bg-transparent text-live-text
           text-[14px] font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-live-soft"
  >
    <Trash size={16} />Delete account
  </button>
</div>

{#snippet heading()}
  <div class="flex flex-col gap-[10px]">
    <h2 class="m-0 font-display font-bold text-[26px] uppercase leading-[1.1] text-live-text">Delete your account?</h2>
    <p class="m-0 text-[14px] leading-[1.5] text-ink-2">This removes your profile, boards, friends, lobbies and game history.</p>
    <p class="m-0 text-[14px] leading-[1.5] text-text-dim">Your name stays in match history other players keep.</p>
  </div>
{/snippet}

{#snippet nameField()}
  <div class="flex flex-col gap-2">
    <label for="delete-account-confirm" class="text-[14px] font-medium text-ink-soft">
      Type <strong class="text-text">{name}</strong> to confirm
    </label>
    <Input id="delete-account-confirm" type="text" bind:value={typed} placeholder={name} autocomplete="off" />
  </div>
{/snippet}

{#if open}
  <Modal onclose={close} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[460px]">
    {#if sent}
      <div class="flex flex-col gap-5">
        <h2 class="m-0 font-display font-bold text-[26px] uppercase leading-[1.1] text-live-text">Delete your account?</h2>
        <p class="m-0 text-[14px] text-ink-2">Check your inbox to confirm. Open the link in this browser, where you're signed in.</p>
        <div class="flex justify-end">
          <Button variant="outline" onclick={close}>Close</Button>
        </div>
      </div>
    {:else if passwordless && reauthed}
      <div class="flex flex-col gap-5">
        {@render heading()}
        <p class="m-0 text-[14px] leading-[1.5] text-ink-2">You signed in with Discord again. This can't be undone.</p>
        {#if error}<ErrorText>{error}</ErrorText>{/if}
        <div class="flex gap-3 justify-end">
          <Button type="button" variant="outline" onclick={close}>Cancel</Button>
          <Button type="button" variant="accent" class="bg-live text-[#fff]" disabled={busy} onclick={deleteReauthed}>Delete account</Button
          >
        </div>
      </div>
    {:else if passwordless}
      <form
        class="flex flex-col gap-5"
        onsubmit={e => {
          e.preventDefault()
          void reauth()
        }}
      >
        {@render heading()}
        {@render nameField()}
        <p class="m-0 text-[14px] leading-[1.5] text-ink-2">Sign in with Discord again to confirm. You'll come back here to delete.</p>
        {#if error}<ErrorText>{error}</ErrorText>{/if}
        <div class="flex gap-3 justify-end">
          <Button type="button" variant="outline" onclick={close}>Cancel</Button>
          <Button type="submit" variant="accent" class="bg-live text-[#fff]" disabled={busy || typed.trim() !== name}>
            <DiscordMark size={18} />Sign in with Discord
          </Button>
        </div>
      </form>
    {:else}
      <form
        class="flex flex-col gap-5"
        onsubmit={e => {
          e.preventDefault()
          void confirm()
        }}
      >
        {@render heading()}
        {@render nameField()}
        <div class="flex flex-col gap-2">
          <label for="delete-account-password" class="text-[14px] font-medium text-ink-soft">Password</label>
          <Input
            id="delete-account-password"
            type="password"
            bind:value={password}
            autocomplete="current-password"
            placeholder="••••••••"
          />
        </div>
        {#if error}<ErrorText>{error}</ErrorText>{/if}
        <div class="flex gap-3 justify-end">
          <Button type="button" variant="outline" onclick={close}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={busy || !canConfirm(typed, name, password)}>Delete account</Button>
        </div>
      </form>
    {/if}
  </Modal>
{/if}
