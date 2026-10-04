<script lang="ts">
  // Your pending invites, live from /ws/me. Accepting while you're in another lobby asks you
  // to leave it first (your guests leave with you).
  import { Mail } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import InviteCard from '$lib/components/lobby/InviteCard.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import { api } from '$lib/api'
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import { me } from '$lib/lobby/sockets'

  const invites = $derived($me?.invites ?? [])
  // Ticks so "just now" ages while the page is open
  let now = $state(new Date())
  onMount(() => {
    const tick = setInterval(() => { now = new Date() }, 30_000)
    return () => clearInterval(tick)
  })
  let error = $state('')
  // Your game is running: finish or end it before accepting
  let runningSessionId = $state<string | null>(null)
  let switching = $state<{ invite: PendingInvite; from: string } | null>(null)
  // An accept or decline in flight: the buttons wait, so a double tap sends one
  let busy = $state(false)

  /** Runs one accept or decline at a time. */
  async function once(run: () => Promise<void>) {
    if (busy) return
    busy = true
    try { await run() } finally { busy = false }
  }

  async function sendAccept(inv: PendingInvite) {
    error = ''
    runningSessionId = null
    const res = await api.POST('/api/invites/{id}/accept', { params: { path: { id: inv.id } } })
    if (res.data) { void push('/lobby'); return }
    const r: Refusal = res.error
    if (r.code === 'in_lobby' && r.lobbyId) switching = { invite: inv, from: r.lobbyId }
    else {
      error = describeConflict(r)
      if (r.code === 'active_session' && r.sessionId) runningSessionId = r.sessionId
    }
  }
  const accept = (inv: PendingInvite) => once(() => sendAccept(inv))

  function leaveAndAccept() {
    const s = switching
    switching = null
    if (!s) return
    return once(async () => {
      await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
      await sendAccept(s.invite)
    })
  }

  const decline = (inv: PendingInvite) => once(async () => {
    const res = await api.POST('/api/invites/{id}/decline', { params: { path: { id: inv.id } } })
    runningSessionId = null
    error = res.error ? describeConflict(res.error) : ''
  })
</script>

<Layout title="Invites">
  <main class="flex flex-grow flex-col gap-3 box-border w-full max-w-[560px] min-w-0 overflow-y-auto p-4 md:px-8 xl:px-11 md:py-10">
    <h2 class="hidden md:block m-0 font-display font-bold text-[48px] leading-none uppercase">Invites</h2>
    {#if error}
      <span class="flex flex-wrap items-center gap-3">
        <ErrorText>{error}</ErrorText>
        {#if runningSessionId}<Button variant="outline" size="sm" href="#/session/{runningSessionId}" class="px-3 text-[13px]">Return to game</Button>{/if}
      </span>
    {/if}
    {#if invites.length === 0}
      <EmptyState title="No pending invites" text="When a friend adds you to their lobby with your @username, it shows up here.">
        {#snippet icon()}<Mail size={24} />{/snippet}
      </EmptyState>
    {:else}
      <ol class="m-0 p-0 list-none flex flex-col gap-[10px]">
        {#each invites as inv (inv.id)}
          <InviteCard invite={inv} {now} {busy} onaccept={() => void accept(inv)} ondecline={() => void decline(inv)} />
        {/each}
      </ol>
      <span class="text-[13px] text-text-dim">Accepting puts you on your usual board; you can change it in the lobby.</span>
    {/if}
  </main>
</Layout>

{#if switching}
  {@const s = switching}
  <SwitchLobbyConfirm from={$me?.lobby?.name ?? 'your lobby'} to={s.invite.lobbyName}
    onconfirm={() => void leaveAndAccept()} oncancel={() => switching = null} />
{/if}
