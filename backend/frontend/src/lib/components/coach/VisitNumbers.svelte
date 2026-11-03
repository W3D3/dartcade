<script lang="ts">
  // The numbers behind a visit's grade, for checking the model (the sandbox; Coach-Leg and the live
  // coach with coach.debug.enabled): what each dart left, its class in full, its change in checkout
  // chance and closeness credit, and the visit's grouping.
  import type { ReviewVisit } from '$shared/coach'
  import { groupingLine, signedPoints, valueLine, whatHappened } from '$lib/coach/numbers'

  let { visit }: { visit: Pick<ReviewVisit, 'n' | 'darts' | 'grouping' | 'tag'> } = $props()

  const COLUMNS: [string, string][] = [
    ['Dart', 'Dart'],
    ['Kind', 'Kind'],
    ['Target', 'Target'],
    ['Dist', "From the target's point (mm)"],
    ['Edge', "From the nearest point of the target's bed (mm)"],
    ['Out', 'Away from the bull (mm)'],
    ['CW', 'Clockwise (mm)'],
    ['Wedges', 'Wedges off'],
    ['Est.', 'Estimated: no camera position'],
    ['Leave', 'Planned → actual leave'],
    ['Δ', 'Change in checkout chance (points)'],
    ['Close', 'Near-miss credit (points)'],
  ]
  const mm = (v: number | null) => (v === null ? '–' : (Math.abs(v) < 0.05 ? 0 : v).toFixed(1))
  const value = $derived(valueLine(visit))
</script>

<div class="flex flex-col gap-2 text-[13.5px] leading-[1.45]">
  <span><b>What happened:</b> {whatHappened(visit)}</span>
  <div class="overflow-x-auto">
    <table class="w-full border-collapse text-[13px] tabular-nums">
      <caption class="sr-only">Visit {visit.n}'s dart classes</caption>
      <thead>
        <tr class="text-left text-text-muted">
          {#each COLUMNS as [c, title] (c)}<th scope="col" {title} class="px-1.5 py-1 font-semibold whitespace-nowrap">{c}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each visit.darts as d, i (i)}
          {@const c = d.class}
          <tr class="border-t border-line">
            <th scope="row" class="px-1.5 py-1 text-left font-display font-bold text-[16px]">{d.name}</th>
            <td class="px-1.5 py-1">{c.kind}{c.hit ? ' ✓' : ''}{'detail' in c && c.detail ? ` (${c.detail})` : ''}</td>
            <td class="px-1.5 py-1">{c.target ? `${c.target.label} (${c.target.aimId})` : '–'}</td>
            <td class="px-1.5 py-1 text-right">{mm(c.miss?.mm ?? null)}</td>
            <td class="px-1.5 py-1 text-right">{mm(c.miss?.edgeMm ?? null)}</td>
            <td class="px-1.5 py-1 text-right">{mm(c.miss?.radialMm ?? null)}</td>
            <td class="px-1.5 py-1 text-right">{mm(c.miss?.tangentialMm ?? null)}</td>
            <td class="px-1.5 py-1 text-right">{c.miss?.wedgesOff ?? '–'}</td>
            <td class="px-1.5 py-1">{c.estimated ? 'yes' : 'no'}</td>
            <td class="px-1.5 py-1 text-right">{c.plannedLeave ?? '–'} → {c.actualLeave ?? '–'}</td>
            <td class="px-1.5 py-1 text-right">{d.delta === null ? '–' : signedPoints(d.delta)}</td>
            <td class="px-1.5 py-1 text-right">{d.closeness === null ? '–' : `+${d.closeness.toFixed(1)}`}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if value}<span class="text-text-muted"><b>Checkout chance:</b> {value}</span>{/if}
  <span class="text-text-muted"
    >{groupingLine(visit) ?? 'No grouping: it needs two darts placed on the board with a target. Rating = score.'}</span
  >
</div>
