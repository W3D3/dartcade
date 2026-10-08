<script lang="ts">
  // Teams: each player's share (X01-Details-Teams): their average and the legs they closed.
  import type { GameDetail } from '$lib/api'

  let { detail }: { detail: GameDetail } = $props()
  const teams = $derived(detail.detail.mode === 'x01' ? (detail.detail.teams ?? []) : [])
  const rows = $derived(
    teams.flatMap(t =>
      t.seats.map(seat => ({
        seat,
        team: t.name,
        name: detail.game.players.find(p => p.seat === seat)?.name ?? '',
        values: detail.stats.seats.find(v => v.index === seat)?.values ?? {},
      })),
    ),
  )
</script>

{#if rows.length > 0}
  <section aria-label="Each player's share" class="card overflow-x-auto">
    <table class="w-full border-collapse text-[15px]">
      <thead>
        <tr class="text-[12px] label-caps text-text-dim">
          <th class="text-left font-normal px-4 py-3">Player</th><th class="text-left font-normal px-2 py-3">Team</th>
          <th class="text-right font-normal px-3 py-3">Avg</th><th class="text-right font-normal px-4 py-3">Closed</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.seat)}
          <tr class="border-t border-line">
            <td class="px-4 py-3 font-semibold">{r.name}</td><td class="px-2 py-3 text-text-muted">{r.team}</td>
            <td class="px-3 py-3 text-right">{Object.hasOwn(r.values, 'average') ? r.values.average.toFixed(1) : '—'}</td>
            <td class="px-4 py-3 text-right">{Object.hasOwn(r.values, 'legsClosed') ? r.values.legsClosed : 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
