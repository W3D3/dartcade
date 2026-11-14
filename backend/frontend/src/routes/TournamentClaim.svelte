<script lang="ts">
  // Claiming a spot of an in-person tournament from its link (Tournament-Claim-Phone,
  // #/tournaments/claim/:code): the spot, what it played so far, Claim as @you, This isn't me.
  // Signed out, App.svelte sends the link through sign-in first and back here. Behind tournaments.enabled.
  import { Trophy } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { TournamentClaim } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import { claimSpot, loadClaim, playedRow, unclaimable } from '$lib/tournaments/claim'

  let { params }: { params: { claim: string } } = $props()

  const enabled = flag('tournaments.enabled')
  // The link is fixed for the page's life
  // svelte-ignore state_referenced_locally
  const code = params.claim
  let claim = $state<TournamentClaim | null>(null)
  let missing = $state(false)
  let failed = $state(false)
  let error = $state('')
  let busy = $state(false)

  function load() {
    failed = false
    void loadClaim(code).then(r => {
      if ('claim' in r) claim = r.claim
      else if (r.error === 'gone') missing = true
      else failed = true
    })
  }
  load()

  async function claimIt() {
    busy = true
    error = ''
    const r = await claimSpot(code)
    busy = false
    if ('claim' in r) claim = r.claim
    else error = r.error
  }

  const when = $derived(
    claim?.startsAt ? new Date(claim.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : null,
  )
  const blocked = $derived(claim ? unclaimable(claim) : null)
</script>

<Layout title="Claim your spot">
  <main class="flex min-h-0 min-w-0 grow flex-col items-center gap-4 overflow-x-hidden overflow-y-auto p-4 md:px-8 md:py-10">
    {#if !$enabled || missing}
      <EmptyState title="This link doesn't work" text="The spot is gone, or the organizer made a new link. Ask them for it.">
        {#snippet icon()}<Trophy size={24} />{/snippet}
      </EmptyState>
    {:else if failed}
      <div class="flex flex-col items-start gap-3">
        <ErrorText>Couldn’t load this link. Check your connection.</ErrorText>
        <Button variant="outline" onclick={load}>Try again</Button>
      </div>
    {:else if !claim}
      <PageLoading />
    {:else}
      <section class="card flex w-full max-w-[460px] flex-col gap-4 p-5" aria-labelledby="claim-title">
        <div class="flex flex-col gap-1">
          <h1 id="claim-title" class="type-section-title font-bold">{claim.claimedByMe ? 'Spot claimed' : 'Claim your spot'}</h1>
          <p class="text-body text-text-muted">
            <span class="font-semibold text-text">“{claim.spotName}”</span>
            in <a href={hrefs.tournament(claim.tournamentId)} class="font-semibold text-text">{claim.tournamentName}</a>{claim.teamName
              ? ` for ${claim.teamName}`
              : ''}, organized by {claim.organizer ?? 'a former member'}{when ? ` · ${when}` : ''} · in person
          </p>
        </div>

        {#if claim.played.length > 0}
          <div class="flex flex-col gap-1.5">
            <h2 class="text-label font-semibold text-text-muted">Played so far as {claim.spotName}</h2>
            <ul class="flex flex-col p-0">
              {#each claim.played as p (`${p.title}-${p.opponent ?? ''}`)}
                {@const row = playedRow(p)}
                <li class="flex items-center justify-between gap-3 border-b border-line py-2 text-label last:border-0">
                  <span class="min-w-0 truncate">{row.title}</span>
                  <span class="shrink-0 font-semibold {row.tone === 'won' ? 'text-success' : row.tone === 'next' ? 'text-text-muted' : ''}"
                    >{row.result}</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if claim.claimedByMe}
          <p class="text-small text-text-muted">These matches are on your account now: stats, history and achievements.</p>
          <Button variant="accent" href={hrefs.tournament(claim.tournamentId)}>Open the tournament</Button>
        {:else if blocked}
          <ErrorText>{blocked}</ErrorText>
          <Button variant="outline" href={hrefs.tournaments()}>Back to tournaments</Button>
        {:else}
          <p class="text-small text-text-muted">
            Claiming moves these matches to your account: stats, history and achievements. The organizer can see that you claimed it.
          </p>
          {#if error}<ErrorText>{error}</ErrorText>{/if}
          <Button variant="accent" disabled={busy} onclick={claimIt}>Claim as @{$currentUser?.name ?? 'you'}</Button>
          <Button variant="outline" href={hrefs.tournaments()}>This isn’t me</Button>
        {/if}
      </section>
    {/if}
  </main>
</Layout>
