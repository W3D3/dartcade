<script lang="ts">
  // The numbers behind a visit's grade, for checking the model (the sandbox; Coach-Leg and the live
  // coach with coach.debug.enabled): what each dart left, its class in full, its change in checkout
  // chance and closeness credit, and the visit's grouping.
  import type { ReviewVisit, VisitGrade } from '$shared/coach'
  import { gradeWorking, groupingLine, signedPoints, whatHappened } from '$lib/coach/numbers'

  let { visit }: { visit: Pick<ReviewVisit, 'n' | 'darts' | 'grouping' | 'tag' | 'left' | 'bust' | 'value'> } = $props()

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
  const working = $derived(gradeWorking(visit))
  /** A point's place on the bar, in % */
  const at = (p: number) => ((p - working.scale.min) / (working.scale.max - working.scale.min)) * 100
  const FILL: Record<VisitGrade, string> = {
    perfect: 'bg-grade-perfect',
    excellent: 'bg-grade-excellent',
    great: 'bg-grade-great',
    good: 'bg-grade-good',
    ok: 'bg-grade-ok',
    inaccuracy: 'bg-grade-inaccuracy',
    weak: 'bg-grade-weak',
    bad: 'bg-grade-bad',
  }
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
  <section aria-label="How the grade was worked out" class="flex flex-col gap-1 text-text-muted">
    <b class="text-text">How the grade was worked out</b>
    <ul class="m-0 list-none p-0">
      {#each working.parts as p (p)}<li>{p}</li>{/each}
    </ul>
    <span class="text-ink-2">{working.result}</span>
    {#if working.rule}<span class="font-semibold text-ice">{working.rule}</span>{/if}
    <!-- The scale: its classes as coloured stretches, the bounds labelled (alternately above and
         below so near ones don't collide) and a marker at the visit's points; the text above says it all -->
    <div aria-hidden="true" class="relative mx-3 mt-5 mb-6 h-2.5">
      {#each working.scale.bands as b (b.grade)}
        <span class="absolute inset-y-0 {FILL[b.grade]}" style:left="{at(b.from)}%" style:width="{at(b.to) - at(b.from)}%"></span>
      {/each}
      {#each working.scale.ticks as t, i (t)}
        <span
          class="absolute -translate-x-1/2 text-[11px] leading-none tabular-nums {i % 2
            ? 'top-[calc(100%+4px)]'
            : 'bottom-[calc(100%+4px)]'}"
          style:left="{at(t)}%">{signedPoints(t)}</span
        >
      {/each}
      <span
        class="absolute -inset-y-1.5 w-[3px] -translate-x-1/2 rounded-full bg-text ring-2 ring-bg"
        style:left="{at(working.scale.marker)}%"
      ></span>
    </div>
  </section>
  <span class="text-text-muted"
    >{groupingLine(visit) ?? 'No grouping: it needs two darts placed on the board with a target. Rating = score.'}</span
  >
</div>
