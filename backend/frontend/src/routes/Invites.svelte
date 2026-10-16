<script lang="ts">
  // Your pending invites, live from /ws/me. Accepting while you're in another lobby asks you
  // to leave it first (your guests leave with you).
  import { Mail } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import Layout from '$lib/components/Layout.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import InviteCard from '$lib/components/lobby/InviteCard.svelte'
  import InviteFeedback from '$lib/components/lobby/InviteFeedback.svelte'
  import { InviteActions } from '$lib/lobby/invites.svelte'
  import { me } from '$lib/lobby/sockets'

  const invites = $derived($me?.invites ?? [])
  // Ticks so "just now" ages while the page is open
  let now = $state(new Date())
  onMount(() => {
    const tick = setInterval(() => {
      now = new Date()
    }, 30_000)
    return () => clearInterval(tick)
  })
  const actions = new InviteActions()
</script>

<Layout title="Invites">
  {#snippet headerAction()}{#if invites.length}<span class="text-[13px] text-text-muted">{invites.length} pending</span>{/if}{/snippet}
  <main class="flex flex-grow flex-col gap-3 box-border w-full max-w-[560px] min-w-0 overflow-y-auto p-4 md:px-8 xl:px-11 md:py-10">
    <h2 class="hidden md:block m-0 font-display font-bold text-[48px] leading-none uppercase">Invites</h2>
    <InviteFeedback {actions} />
    {#if invites.length === 0}
      <EmptyState title="No pending invites" text="When a friend adds you to their lobby with your @username, it shows up here.">
        {#snippet icon()}<Mail size={24} />{/snippet}
      </EmptyState>
    {:else}
      <ol class="m-0 p-0 list-none flex flex-col gap-[10px]">
        {#each invites as inv (inv.id)}
          <InviteCard invite={inv} {now} {actions} />
        {/each}
      </ol>
      <span class="text-[13px] text-text-dim">Accepting puts you on your usual board; you can change it in the lobby.</span>
    {/if}
  </main>
</Layout>
