<script lang="ts">
  // The Tournaments page (Tournaments, Tournaments-Phone): Browse, My tournaments and Teams, as
  // underlined tabs on a desktop and a segmented control on a phone. Behind tournaments.enabled.
  import { Trophy, UsersRound } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import { TAB_LABELS, TOURNAMENT_TABS, tabOf, type TournamentsTab } from '$lib/tournaments/tabs'

  let { params = {} }: { params?: { tab?: string } } = $props()

  const enabled = flag('tournaments.enabled')
  const tab = $derived(tabOf(params.tab))

  const EMPTY: Record<TournamentsTab, { title: string; text: string }> = {
    browse: {
      title: 'No tournaments yet',
      text: 'Open tournaments show up here: official events from Dartcade and tournaments run by players.',
    },
    mine: {
      title: 'Nothing here yet',
      text: 'Tournaments you register for or organize show up here, with your next match first.',
    },
    teams: {
      title: 'No teams yet',
      text: 'Teams you make or join show up here. A team registers for team tournaments together.',
    },
  }
</script>

<Layout title="Tournaments">
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <header class="hidden flex-col gap-1.5 md:flex">
      <h1 class="type-page-title">Tournaments</h1>
      <p class="text-body text-text-muted">Official events from Dartcade and tournaments run by players. Solo or as a team.</p>
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
            >{TAB_LABELS[t].label}</a
          >
        {/each}
      </nav>
      <div class="md:hidden">
        <SegmentedControl
          label="Tournaments"
          value={tab}
          fill
          items={TOURNAMENT_TABS.map(t => ({ id: t, label: TAB_LABELS[t].short, href: hrefs.tournaments(t) }))}
        />
      </div>

      <section aria-label={TAB_LABELS[tab].label} class="pt-2 md:pt-4">
        <EmptyState title={EMPTY[tab].title} text={EMPTY[tab].text}>
          {#snippet icon()}
            {#if tab === 'teams'}<UsersRound size={24} />{:else}<Trophy size={24} />{/if}
          {/snippet}
        </EmptyState>
      </section>
    {/if}
  </main>
</Layout>
