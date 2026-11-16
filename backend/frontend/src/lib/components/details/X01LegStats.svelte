<script lang="ts">
  // One leg's match stats (the Leg stats tab): the match's table with that leg's values.
  import type { GameDetail } from '$lib/api'
  import StatsTable from './StatsTable.svelte'
  import Standings from './Standings.svelte'
  import { detailSides, layoutOf } from '$lib/details/page'
  import { legStarterKey, x01Sides } from '$lib/details/x01'

  let { detail, leg }: { detail: GameDetail; leg: number } = $props()
  const stats = $derived(detail.stats.legs?.find(l => l.leg === leg))
  const sides = $derived(stats ? detailSides({ ...detail, stats }) : [])
  const starter = $derived.by(() => {
    const x01 = detail.detail.mode === 'x01' ? detail.detail : null
    return x01 ? legStarterKey(x01, leg, x01Sides(detail.game, x01)) : null
  })
  const layout = $derived(layoutOf(detail))
</script>

{#if stats}
  {#if layout === 'party'}
    <Standings rows={stats.rows} {sides} ranked={false} {starter} />
  {:else}
    <StatsTable rows={stats.rows} {sides} title={layout === 'teams' ? 'Team stats' : 'Leg stats'} />
  {/if}
{/if}
