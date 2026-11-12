<script lang="ts">
  // The organizer page of an in-person tournament (Tournament-Onsite, Tournament-Onsite-Teams,
  // `#/tournaments/:id/manage`): the header with Edit, Open tournament mode, the players or teams
  // with their claim links, and how claim links work. Behind tournaments.enabled; organizers only.
  import { ChevronLeft, Info, Pencil, TvMinimal } from '@lucide/svelte'
  import { replace } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import OnsiteParticipants from '$lib/components/tournaments/OnsiteParticipants.svelte'
  import OrganizersCard from '$lib/components/tournaments/OrganizersCard.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { flag, flagsLoaded } from '$lib/flags'
  import { dayMonth, weekday } from '$lib/fmt'
  import { hrefs } from '$lib/routes'
  import { loadTournament, type Tournament } from '$lib/tournaments/create'
  import { loadParticipants, organizerLine, type Participants } from '$lib/tournaments/participants'
  import { isEditable } from '$shared/tournaments/state'

  let { params = {} }: { params?: { id?: string } } = $props()

  const enabled = flag('tournaments.enabled')
  /** Undefined while it loads, null if it isn't there (or the caller may not see it). */
  let t = $state<Tournament | null | undefined>(undefined)
  let participants = $state<Participants | null>(null)

  $effect(() => {
    const id = params.id
    if (!id) return
    t = undefined
    void loadTournament(id).then(async found => {
      participants = found?.role && found.access === 'in_person' ? await loadParticipants(id) : null
      t = found
    })
  })

  const editable = $derived(!!t && isEditable(t.status))
  const when = $derived.by(() => {
    const d = t?.settings.plannedFor ? new Date(t.settings.plannedFor) : null
    return d ? ` · ${weekday(d)} ${dayMonth(d)}` : ''
  })
</script>

<Layout title={t?.name ?? 'Tournament'}>
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <a href={hrefs.tournaments('mine')} class="inline-flex w-fit items-center gap-1.5 text-label font-semibold text-text no-underline">
      <ChevronLeft size={16} />Tournaments
    </a>

    {#if !$flagsLoaded || t === undefined}
      <PageLoading />
    {:else if !$enabled}
      <p class="text-body text-text-muted">Tournaments aren't available yet.</p>
    {:else if !t}
      <p class="text-body text-text-muted">This tournament isn't there anymore.</p>
    {:else if !t.role}
      <p class="text-body text-text-muted">Only the tournament's organizers can manage it.</p>
    {:else if t.access !== 'in_person' || !participants}
      <p class="text-body text-text-muted">Only in-person tournaments have an organizer page.</p>
    {:else}
      <header class="flex flex-wrap items-start gap-4">
        <div class="flex min-w-0 grow flex-col gap-2">
          <span class="flex flex-wrap items-center gap-2 text-small text-text-muted">
            <span class="inline-flex h-[22px] items-center rounded-full bg-ice-soft px-2 text-caption font-bold text-ice">IN PERSON</span>
            {#if t.teamSize > 1}
              <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold text-ink-2"
                >TEAMS OF {t.teamSize}</span
              >
            {/if}
            {#if t.status === 'draft'}
              <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold text-ink-2"
                >DRAFT</span
              >
            {/if}
            {t.role === 'owner' ? 'You own this tournament' : 'You organize this tournament'}{when}
          </span>
          <h1 class="type-page-title wrap-break-word">{t.name}</h1>
          <span class="text-label text-text-muted">{organizerLine(t, participants.entries.length)}</span>
        </div>
        {#if editable}<Button variant="outline" href={hrefs.tournamentEdit(t.id)}><Pencil size={16} />Edit</Button>{/if}
      </header>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-5">
          <section class="card flex flex-wrap items-center gap-4 p-[18px] md:px-[22px]" aria-labelledby="onsite-mode">
            <TvMinimal size={28} class="shrink-0 text-accent" aria-hidden="true" />
            <span class="flex min-w-0 grow basis-60 flex-col gap-1">
              <h2 id="onsite-mode" class="text-body-lg font-semibold">Open tournament mode</h2>
              <span class="text-small text-text-muted">
                Turns this device into a tournament screen: pick a match, press Play, enter scores. Do the same on every tablet or laptop at
                the venue that’s logged in to your account.
              </span>
            </span>
            <!-- Tournament mode comes with #616 -->
            <Button variant="accent" disabled title="Tournament mode is coming soon">Open on this device</Button>
          </section>

          <OnsiteParticipants tournamentId={t.id} bind:participants teamSize={t.teamSize} max={t.maxEntries} {editable} />
        </div>

        <aside class="flex min-w-0 flex-col gap-5" aria-label="About this tournament">
          <div class="card p-[18px]">
            <OrganizersCard tournamentId={t.id} tournamentName={t.name} onleft={() => void replace(hrefs.tournaments('mine').slice(1))} />
          </div>
          <!-- Devices in tournament mode (#616) mounts here -->
          <section class="card flex flex-col gap-2 p-[18px]" aria-labelledby="onsite-claim">
            <h2 id="onsite-claim" class="flex items-center gap-2 text-body-lg font-semibold">
              <Info size={16} aria-hidden="true" />Claim links
            </h2>
            {#if t.teamSize > 1}
              <p class="text-small text-text-muted">
                Claim links are per player, not per team. When a player claims their spot, the team’s matches count for that player’s
                account. Teams here are only for this tournament. They aren’t saved as Dartcade teams, so a team made of guests doesn’t need
                anyone to sign up.
              </p>
              <p class="text-small text-text-muted">
                Only organizers can add, rename or remove teams and players. Claimed players can’t be renamed; unlink them first.
              </p>
            {:else}
              <p class="text-small text-text-muted">
                Every player starts as a guest. Send someone their claim link; when they open it with their Dartcade account, the spot
                becomes theirs. Matches they already played move to their account: stats, history and achievements. One person can claim one
                spot per tournament.
              </p>
              <p class="text-small text-text-muted">
                Only organizers can add, rename or remove players. Renaming a claimed player isn’t possible; unlink them first.
              </p>
            {/if}
          </section>
        </aside>
      </div>
    {/if}
  </main>
</Layout>
