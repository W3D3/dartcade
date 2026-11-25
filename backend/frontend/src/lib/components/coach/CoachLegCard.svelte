<script lang="ts">
  // One leg's review as a card (the Coach page's list, in the details page's Review tab): the
  // result, darts and average, what the coach found, its take and the skill letters, and a link to
  // the full review.
  import { hrefs } from '$lib/routes'
  import { Sparkles } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button'
  import Pill from './Pill.svelte'
  import { coachFound, vsLine } from '$lib/coach/list'
  import { pillTone, SKILL_TONE, TONE_TEXT } from '$lib/coach/tone'
  import type { CoachLegDetail } from '$lib/api'

  let { gameId, leg, detail }: { gameId: string; leg: number; detail: CoachLegDetail } = $props()
  const { review, title } = $derived(detail)
  const skills = $derived([
    { name: 'Scoring', ...review.skills.scoring },
    { name: 'Setup', ...review.skills.setup },
    { name: 'Doubling', ...review.skills.doubling },
  ])
</script>

<article aria-label="Leg {leg + 1} review" class="card flex flex-col gap-3 p-4 md:px-[22px] md:py-5">
  <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
    <div class="flex min-w-0 flex-col gap-0.5">
      <h3 class="font-display text-[20px] font-bold uppercase tracking-wordmark">Leg {leg + 1}</h3>
      <span class="text-small text-text-dim">{vsLine(title.opponents)} · {title.context}</span>
    </div>
    <div class="flex items-center gap-4 text-small text-text-muted">
      <Pill label={review.won ? 'Won' : 'Lost'} tone={review.won ? 'lime' : 'bad'} />
      <span><span class="font-display text-[20px] font-bold text-text">{review.darts}</span> darts</span>
      <span
        ><span class="font-display text-[20px] font-bold text-text">{review.average === null ? '–' : review.average.toFixed(1)}</span> avg</span
      >
    </div>
  </header>
  <span class="flex flex-wrap gap-1.5">
    {#each coachFound(review.counts) as p (p.label)}<Pill {...p} />{/each}
  </span>
  <p class="text-body/normal">{review.take}</p>
  <ul class="flex flex-wrap gap-2">
    {#each skills as s (s.name)}
      {@const tone = SKILL_TONE[s.grade ?? 'none']}
      <li class="flex items-center gap-2 text-small text-text-muted">
        <span class="flex size-8 items-center justify-center rounded-md font-display text-[20px] font-bold {pillTone(tone)}"
          ><span class={TONE_TEXT[tone]}>{s.grade ?? '–'}</span></span
        >{s.name}
      </li>
    {/each}
  </ul>
  <div>
    <Button href={hrefs.coachLeg(gameId, leg)} variant="outline" class="h-[38px] gap-1.5 text-body font-semibold"
      ><Sparkles size={16} />Open full review<span class="sr-only"> of leg {leg + 1}</span></Button
    >
  </div>
</article>
