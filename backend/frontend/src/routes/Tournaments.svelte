<script lang="ts">
  // The Tournaments page (Tournaments, Tournaments-Phone): Browse, My tournaments and Teams, as
  // underlined tabs on a desktop and a segmented control on a phone, and the Create tournament
  // button for those who may create one. Behind tournaments.enabled.
  import { Plus } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import TeamsTab from '$lib/components/teams/TeamsTab.svelte'
  import BrowseTab from '$lib/components/tournaments/BrowseTab.svelte'
  import MineTab from '$lib/components/tournaments/MineTab.svelte'
  import UpNextCard from '$lib/components/tournaments/UpNextCard.svelte'
  import TeamRequestBanner from '$lib/components/tournaments/TeamRequestBanner.svelte'
  import YourTeamsCard from '$lib/components/teams/YourTeamsCard.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import type { MyTournaments } from '$lib/api'
  import { loadMine, mineCount } from '$lib/tournaments/mine'
  import { TAB_LABELS, TOURNAMENT_TABS, tabOf } from '$lib/tournaments/tabs'

  // `code`: an invite link (#/tournaments/join/:code), shown on Browse
  let { params = {} }: { params?: { tab?: string; code?: string } } = $props()

  const enabled = flag('tournaments.enabled')
  const community = flag('tournaments.community.enabled')
  // Admins may always create one (the server's rule)
  const mayCreate = $derived($enabled && (!!$currentUser?.isAdmin || $community))
  const tab = $derived(tabOf(params.tab))
  // Pending team invites: the Teams tab's badge
  const teamInvites = $derived($me?.teamInvites.length ?? 0)
  // New team, from the header or the Teams tab
  let creating = $state(false)

  // Your tournaments: the Mine tab's badge and list, and Browse's "Up next for you"
  let mine = $state<MyTournaments | null>(null)
  let mineFailed = $state(false)
  async function reloadMine() {
    const m = await loadMine()
    mineFailed = m === null
    if (m) mine = m
  }
  $effect(() => {
    if ($enabled) void reloadMine()
  })
  const mineBadge = $derived(mine ? mineCount(mine) : 0)
</script>

<Layout title="Tournaments">
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <header class="flex items-end justify-between gap-6">
      <div class="hidden flex-col gap-1.5 md:flex">
        <h1 class="type-page-title">Tournaments</h1>
        <p class="text-body text-text-muted">
          {tab === 'teams'
            ? 'Named teams you can register with again and again. Make one, invite friends, play team tournaments.'
            : 'Official events from Dartcade and tournaments run by players. Solo or as a team.'}
        </p>
      </div>
      <div class="ml-auto flex gap-2.5">
        {#if $enabled}
          <Button variant="outline" href={hrefs.tournaments('teams')} onclick={() => (creating = true)}><Plus size={16} />New team</Button>
        {/if}
        {#if mayCreate}
          <Button variant="accent" href={hrefs.tournamentNew()} class="hidden h-10 md:inline-flex"
            ><Plus size={18} />Create tournament</Button
          >
        {/if}
      </div>
    </header>

    {#if !$enabled && !$flagsLoaded}
      <PageLoading />
    {:else if !$enabled}
      <p class="text-body text-text-muted">Tournaments aren't available yet.</p>
    {:else}
      <nav aria-label="Tournaments" class="hidden gap-1 border-b border-line md:flex">
        {#each TOURNAMENT_TABS as t (t)}
          <a
            href={hrefs.tournaments(t)}
            aria-current={t === tab ? 'page' : undefined}
            class="-mb-px flex h-[46px] items-center border-b-2 px-4 text-body no-underline
                   {t === tab ? 'border-accent font-semibold text-text' : 'border-transparent font-medium text-text-muted hover:text-text'}"
            >{TAB_LABELS[t].label}{#if t === 'teams' && teamInvites > 0}<span
                class="ml-2 rounded-pill bg-accent px-[7px] py-0.5 type-pill text-accent-fg"
                aria-label="{teamInvites} invites">{teamInvites}</span
              >{:else if t === 'mine' && mineBadge > 0}<span
                class="ml-2 rounded-pill bg-surface-chip px-[7px] py-0.5 type-pill text-ink-2"
                aria-label="{mineBadge} tournaments">{mineBadge}</span
              >{/if}</a
          >
        {/each}
      </nav>
      <div class="md:hidden">
        <SegmentedControl
          label="Tournaments"
          value={tab}
          fill
          items={TOURNAMENT_TABS.map(t => ({
            id: t,
            label: `${TAB_LABELS[t].short}${t === 'teams' && teamInvites > 0 ? ` (${teamInvites})` : t === 'mine' && mineBadge > 0 ? ` · ${mineBadge}` : ''}`,
            href: hrefs.tournaments(t),
          }))}
        />
      </div>

      <section aria-label={TAB_LABELS[tab].label} class="flex flex-col gap-6 pt-2 md:pt-4">
        <TeamRequestBanner />
        {#if tab === 'teams'}
          <TeamsTab bind:creating />
        {:else if tab === 'browse'}
          <BrowseTab code={params.code}>
            {#snippet aside()}{#if mine}<UpNextCard {mine} />{/if}<YourTeamsCard />{/snippet}
          </BrowseTab>
        {:else if mine}
          <MineTab {mine} onchange={reloadMine}>
            {#snippet aside()}<YourTeamsCard />{/snippet}
          </MineTab>
        {:else if mineFailed}
          <ErrorText>Couldn't load your tournaments. Try again in a moment.</ErrorText>
        {:else}
          <PageLoading />
        {/if}
      </section>
      {#if mayCreate}
        <Button variant="outline" size="md" class="md:hidden" href={hrefs.tournamentNew()}><Plus size={18} />Create tournament</Button>
      {/if}
    {/if}
  </main>
</Layout>
