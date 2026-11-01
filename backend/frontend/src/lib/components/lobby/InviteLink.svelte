<script lang="ts">
  // An invite link opened while signed out (Lobby-Invite-Link): the lobby first, then sign in
  // or sign up, and come straight back to the link.
  import { push } from 'svelte-spa-router'
  import type { components } from '$lib/api/schema'
  import Wordmark from '$lib/components/Wordmark.svelte'
  import InviteAvatar from './InviteAvatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import LobbyGlance from './LobbyGlance.svelte'
  import { formatCode, joinPath } from '$lib/lobby/format'
  import { rememberReturn, sessionStore } from '$lib/returnTo'

  let {
    code,
    viaQr,
    preview,
    missing,
    failed,
    onretry,
  }: {
    code: string
    /** Opened from the host's QR code: signing in comes back to it, still at the host's board. */
    viaQr: boolean
    preview: components['schemas']['LobbyPreview'] | null
    /** No open lobby has the code (or it isn't one). */
    missing: boolean
    /** The lookup itself failed: Try again calls onretry. */
    failed: boolean
    onretry: () => void
  } = $props()

  const host = $derived(preview?.host?.name ?? 'The host')

  function go(page: '/login' | '/register') {
    rememberReturn(sessionStore(), joinPath(code, viaQr).slice(1))
    void push(page)
  }
</script>

<div
  class="min-h-dvh box-border flex flex-col gap-[22px] px-4 pt-[18px] pb-5 md:px-11 md:py-[34px] text-text bg-[radial-gradient(900px_500px_at_50%_30%,#1a2012,var(--color-bg)_70%)]"
>
  <header class="flex items-center justify-between">
    <Wordmark text="text-[26px]" badge={false} />
    <a href="#/login" onclick={e => (e.preventDefault(), go('/login'))} class="text-[14px] md:text-[15px] font-semibold no-underline"
      >Sign in</a
    >
  </header>
  <main class="flex-grow flex md:items-center justify-center">
    <section
      aria-labelledby="invite-link-title"
      class="w-full max-w-[480px] h-fit box-border flex flex-col gap-[18px] px-[18px] py-[22px] md:px-[34px] md:py-8 rounded-[20px] bg-surface-panel border border-line-2"
    >
      {#if preview}
        <div class="flex items-center gap-[14px]">
          <InviteAvatar name={host} face={preview.host} size={56} offset="ring-offset-surface-panel" />
          <span class="flex flex-col gap-[3px]">
            <span class="text-[12px] font-bold label-caps text-accent">Lobby invite</span>
            <span class="text-[15px] text-ink-2"><strong class="text-text">{host}</strong> invited you to play darts</span>
          </span>
        </div>
        <h1 id="invite-link-title" class="m-0 font-display font-bold text-[40px] md:text-[52px] leading-[0.95] uppercase">
          {preview.name}
        </h1>
        <LobbyGlance glance={preview} class="bg-bg" />
      {:else}
        <h1 id="invite-link-title" class="m-0 font-display font-bold text-[40px] leading-[0.95] uppercase">Lobby invite</h1>
        <p class="m-0 text-[15px] text-text-muted">
          {#if missing}This lobby is closed, or the link is wrong. Ask the host for a new one.
          {:else if failed}Couldn't look up the lobby.
            <button
              type="button"
              onclick={onretry}
              class="p-0 border-0 bg-transparent text-accent font-semibold cursor-pointer font-[inherit]">Try again</button
            >
          {:else}Looking up the lobby…{/if}
        </p>
      {/if}
      <div class="flex flex-col gap-[10px]">
        <Button size="lg" class="h-[52px] rounded-[12px] text-[22px] tracking-[0.06em]" onclick={() => go('/login')}>Sign in to join</Button
        >
        <Button variant="outline" class="h-12 rounded-[12px] border-line-strong text-[15px] font-semibold" onclick={() => go('/register')}
          >Create a free account</Button
        >
      </div>
      <p class="m-0 text-[13px] leading-[1.5] text-text-dim">
        You'll come straight back to this lobby after signing in. To throw, you need an Autodarts board paired to Dartcade.
        {#if preview}The link works until {host} closes the lobby.{/if}
      </p>
      <div class="flex items-center gap-[10px] pt-[14px] border-t border-surface-paused text-[13px] text-text-muted">
        Or enter the code in the app<span class="ml-auto font-mono text-[16px] tracking-[0.12em] text-text">{formatCode(code)}</span>
      </div>
    </section>
  </main>
</div>
