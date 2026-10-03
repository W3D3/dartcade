<script lang="ts">
  // Your pending invites, live from /ws/me. Accepting while you're in another lobby asks you
  // to leave it first (your guests leave with you).
  import { Mail } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import InviteCard from '$lib/components/lobby/InviteCard.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import { api } from '$lib/api'
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import { me } from '$lib/lobby/sockets'

  const invites = $derived($me?.invites ?? [])
  const now = new Date()
  let error = $state('')
  let switching = $state<{ invite: PendingInvite; from: string } | null>(null)

  async function accept(inv: PendingInvite) {
    error = ''
    const res = await api.POST('/api/invites/{id}/accept', { params: { path: { id: inv.id } } })
    if (res.data) { void push('/lobby'); return }
    const r: Refusal = res.error
    if (r.code === 'in_lobby' && r.lobbyId) switching = { invite: inv, from: r.lobbyId }
    else error = describeConflict(r)
  }

  async function leaveAndAccept() {
    const s = switching
    switching = null
    if (!s) return
    await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
    await accept(s.invite)
  }

  async function decline(inv: PendingInvite) {
    const res = await api.POST('/api/invites/{id}/decline', { params: { path: { id: inv.id } } })
    error = res.error ? describeConflict(res.error) : ''
  }
</script>

<Layout title="Invites">
  <main class="flex flex-grow flex-col gap-3 box-border w-full max-w-[560px] min-w-0 overflow-y-auto p-4 md:px-11 md:py-10">
    <h2 class="hidden md:block m-0 font-display font-bold text-[48px] leading-none uppercase">Invites</h2>
    {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
    {#if invites.length === 0}
      <EmptyState title="No pending invites" text="When a friend adds you to their lobby with your @username, it shows up here.">
        {#snippet icon()}<Mail size={24} />{/snippet}
      </EmptyState>
    {:else}
      <ol class="m-0 p-0 list-none flex flex-col gap-[10px]">
        {#each invites as inv (inv.id)}
          <InviteCard invite={inv} {now} onaccept={() => void accept(inv)} ondecline={() => void decline(inv)} />
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
