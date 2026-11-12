<script lang="ts">
  // The Tournaments page (Tournaments, Tournaments-Phone): Browse, My tournaments and Teams, as
  // underlined tabs on a desktop and a segmented control on a phone. Behind tournaments.enabled.
  import { Plus, Trophy } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import TeamsTab from '$lib/components/teams/TeamsTab.svelte'
  import BrowseTab from '$lib/components/tournaments/BrowseTab.svelte'
  import YourTeamsCard from '$lib/components/teams/YourTeamsCard.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { me } from '$lib/lobby/sockets'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import { TAB_LABELS, TOURNAMENT_TABS, tabOf } from '$lib/tournaments/tabs'

  // `code`: an invite link (#/tournaments/join/:code), shown on Browse
  let { params = {} }: { params?: { tab?: string; code?: string } } = $props()

  const enabled = flag('tournaments.enabled')
  const tab = $derived(tabOf(params.tab))
  // Pending team invites: the Teams tab's badge
  const teamInvites = $derived($me?.teamInvites.length ?? 0)
  // New team, from the header or the Teams tab
  let creating = $state(false)
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
      {#if $enabled}
        <Button variant="outline" href={hrefs.tournaments('teams')} onclick={() => (creating = true)} class="ml-auto"
          ><Plus size={16} />New team</Button
        >
      {/if}
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
            label: t === 'teams' && teamInvites > 0 ? `${TAB_LABELS[t].short} (${teamInvites})` : TAB_LABELS[t].short,
            href: hrefs.tournaments(t),
          }))}
        />
      </div>

      <section aria-label={TAB_LABELS[tab].label} class="flex flex-col gap-6 pt-2 md:pt-4">
        {#if tab === 'teams'}
          <TeamsTab bind:creating />
        {:else if tab === 'browse'}
          <BrowseTab code={params.code}>
            {#snippet aside()}<YourTeamsCard />{/snippet}
          </BrowseTab>
        {:else}
          <EmptyState title="Nothing here yet" text="Tournaments you register for or organize show up here, with your next match first.">
            {#snippet icon()}<Trophy size={24} />{/snippet}
          </EmptyState>
        {/if}
      </section>
    {/if}
  </main>
</Layout>
