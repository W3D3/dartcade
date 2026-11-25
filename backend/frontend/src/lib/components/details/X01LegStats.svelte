<script lang="ts">
  // The Statistics tab's body: the match's numbers as comparison bars, for the whole match (`leg`
  // null) or for one leg, with each player's share for teams.
  import type { GameDetail } from '$lib/api'
  import StatBars from './StatBars.svelte'
  import TeamShares from './TeamShares.svelte'
  import { detailSides, layoutOf } from '$lib/details/page'

  let { detail, leg }: { detail: GameDetail; leg: number | null } = $props()
  const stats = $derived(leg === null ? detail.stats : detail.stats.legs?.find(l => l.leg === leg))
  const sides = $derived(stats ? detailSides({ ...detail, stats }) : [])
  const layout = $derived(layoutOf(detail))
  const title = $derived(leg === null ? 'Match statistics' : `Leg ${leg + 1} statistics`)
</script>

{#if stats}
  <StatBars rows={stats.rows} {sides} {title} />
  {#if leg === null && layout === 'teams'}<TeamShares {detail} />{/if}
{/if}
