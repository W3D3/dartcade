<script lang="ts">
  // The coach's take on a leg (Coach-Leg): the take and a row per skill with its A–D letter (the
  // scoring row's line with the leg's grouping when the camera placed its darts). On
  // phones (Coach-Phone-Leg) the letters sit 3 across above the take.
  import type { LegReview, SkillGrade } from '$shared/coach'
  import { legGroupingLine } from '$lib/coach/view'

  let { take, skills, grouping }: Pick<LegReview, 'take' | 'skills' | 'grouping'> = $props()

  // A and B lime, C yellow, D red; a skill the leg didn't test dim
  const TONE: Record<NonNullable<SkillGrade['grade']>, { text: string; bg: string }> = {
    A: { text: 'text-accent', bg: 'bg-accent/16' },
    B: { text: 'text-accent', bg: 'bg-accent/16' },
    C: { text: 'text-gold', bg: 'bg-gold/16' },
    D: { text: 'text-live', bg: 'bg-live/16' },
  }
  const tone = (g: SkillGrade['grade']) => (g === null ? { text: 'text-text-dim', bg: 'bg-surface-paused' } : TONE[g])
  const rows = $derived([
    { name: 'Scoring power', short: 'Scoring', ...skills.scoring, line: skills.scoring.line + legGroupingLine(grouping) },
    { name: 'Setup shots', short: 'Setup', ...skills.setup },
    { name: 'Doubling', short: 'Doubling', ...skills.doubling },
  ])
</script>

<!-- Phones -->
<div class="flex flex-col gap-3 xl:hidden">
  <ul class="m-0 grid list-none grid-cols-3 gap-2 p-0">
    {#each rows as r (r.name)}
      <li class="card flex flex-col items-start gap-1 p-3">
        <span class="font-display text-[30px] font-bold leading-none {tone(r.grade).text}">{r.grade ?? '–'}</span>
        <span class="text-[12px] text-text-muted">{r.short}</span>
      </li>
    {/each}
  </ul>
  <p class="m-0 text-[15px] leading-normal">{take}</p>
</div>

<!-- Desktop -->
<section class="card hidden flex-col gap-1.5 px-[22px] py-5 xl:flex">
  <h2 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Coach's take</h2>
  <p class="mt-1 mb-2 text-[17px] leading-normal">{take}</p>
  {#each rows as r (r.name)}
    {@const t = tone(r.grade)}
    <div class="flex items-center gap-3.5 border-t border-surface-paused py-3">
      <span class="flex size-11 flex-none items-center justify-center rounded-[10px] font-display text-[26px] font-bold {t.text} {t.bg}"
        >{r.grade ?? '–'}</span
      >
      <span class="flex flex-col gap-0.5">
        <span class="text-[15px] font-semibold">{r.name}</span>
        <span class="text-[13px] text-text-muted">{r.line}</span>
      </span>
    </div>
  {/each}
</section>
