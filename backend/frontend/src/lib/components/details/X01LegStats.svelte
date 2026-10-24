<script lang="ts">
  // One leg's match stats (the Leg stats tab): the match's table with that leg's values.
  import type { GameDetail } from '$lib/api'
  import StatsTable from './StatsTable.svelte'
  import Standings from './Standings.svelte'
  import { detailSides, layoutOf } from '$lib/details/page'

  let { detail, leg }: { detail: GameDetail; leg: number } = $props()
  const stats = $derived(detail.stats.legs?.find(l => l.leg === leg))
  const sides = $derived(stats ? detailSides({ ...detail, stats }) : [])
  const layout = $derived(layoutOf(detail))
</script>

{#if stats}
  {#if layout === 'party'}
    <Standings rows={stats.rows} {sides} ranked={false} />
  {:else}
    <StatsTable rows={stats.rows} {sides} title={layout === 'teams' ? 'Team stats' : 'Leg stats'} />
  {/if}
{/if}
