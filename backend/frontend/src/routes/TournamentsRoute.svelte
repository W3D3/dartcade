<script lang="ts">
  // #/tournaments/:tab?: one of the Tournaments page's tabs, or any other value a tournament's live
  // page (#/tournaments/:id): the router can't tell a tab from an id by itself.
  import TournamentLive from './TournamentLive.svelte'
  import Tournaments from './Tournaments.svelte'
  import { TOURNAMENT_TABS } from '$lib/tournaments/tabs'

  let { params = {} }: { params?: { tab?: string } } = $props()

  const id = $derived(params.tab !== undefined && !TOURNAMENT_TABS.some(t => t === params.tab) ? params.tab : null)
</script>

{#if id === null}
  <Tournaments {params} />
{:else}
  {#key id}<TournamentLive params={{ id }} />{/key}
{/if}
