<script lang="ts">
  // X01 Breakdown body for one leg (X01-Details*): the leg's summary line, the points-left chart
  // and the chalkboard. The chalkboard sits under the chart. The leg number and the
  // highlighted side are picked by X01Section, which also owns the surrounding card, the
  // title-tabs and the header row (leg selector / highlight picker) — X01Section renders this
  // once per leg when "Match" is selected, each under its own "Leg N" heading.
  import type { GameDetail } from '$lib/api'
  import Chalkboard from './Chalkboard.svelte'
  import RemainingChart from './RemainingChart.svelte'
  import { chalkboardRows, legSeries, legStarterKey, legSummary, sideRules, x01Sides } from '$lib/details/x01'

  let { detail, leg, highlight }: { detail: GameDetail; leg: number; highlight: number | null } = $props()
  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const starts = $derived(sideRules(detail.game.config, sides).map(r => r.startScore))
  const starter = $derived(x01 ? legStarterKey(x01, leg, sides) : null)
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const forfeitedBy = $derived(detail.game.players.find(p => p.forfeited)?.name ?? null)
</script>

{#if x01}
  <div class="flex flex-col gap-4 min-w-0">
    <p class="text-[15px] text-text-muted">{legSummary(x01, leg, sides, nameOf, forfeitedBy)}</p>
    <div class="flex flex-col gap-4">
      <div class="min-w-0">
        <RemainingChart series={legSeries(x01, leg, sides, starts)} {sides} start={Math.max(...starts)} {highlight} {starter} />
      </div>
      <div class="min-w-0">
        <Chalkboard rows={chalkboardRows(x01, leg, sides)} {sides} showThrower={!!x01.teams} {nameOf} {starter} />
      </div>
    </div>
  </div>
{/if}
