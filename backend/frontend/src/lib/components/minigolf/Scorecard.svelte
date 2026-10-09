<!-- The minigolf scorecard: holes × players, par, total and score to par (Minigolf-Scorecard.dc.html). -->
<script lang="ts">
  import { scorecardRows } from '$lib/minigolf/scorecard'

  let { scores, pars, players }: { scores: (number | null)[][]; pars: number[]; players: { name: string }[] } = $props()

  const rows = $derived(scorecardRows(scores, pars, players))
  const TONE = { under: 'text-accent', par: 'text-text', over: 'text-live-text', none: 'text-text-muted' } as const
</script>

<div class="overflow-x-auto">
  <table class="w-full border-collapse text-[15px] tabular-nums" data-testid="scorecard">
    <thead>
      <tr class="text-[12px] uppercase tracking-[0.08em] text-text-muted">
        <th class="py-2 pr-3 text-left font-medium">Player</th>
        {#each pars as par, h (h)}
          <th class="px-2 py-2 text-center font-medium"
            >{h + 1}<span class="block text-[11px] normal-case tracking-normal">par {par}</span></th
          >
        {/each}
        <th class="px-2 py-2 text-center font-medium">Total</th>
        <th class="pl-2 py-2 text-center font-medium">To par</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r, i (r.seat)}
        <tr class="border-t border-line">
          <td class="py-2 pr-3"><span class="mr-2 text-text-muted">{i + 1}</span>{r.name}</td>
          {#each r.cells as c, h (h)}
            <td class="px-2 py-2 text-center {TONE[c.tone]}">
              {c.text}{#if c.ace}<span class="block text-[10px] font-bold tracking-[0.08em] text-accent">ACE</span>{/if}
            </td>
          {/each}
          <td class="px-2 py-2 text-center font-semibold">{r.total}</td>
          <td class="pl-2 py-2 text-center font-semibold">{r.toPar}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
