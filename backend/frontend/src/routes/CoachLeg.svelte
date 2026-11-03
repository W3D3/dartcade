<script lang="ts">
  // One leg's review (Coach-Leg, Coach-Phone-Leg): the coach's take and skill letters, then every
  // visit graded. The selected visit shows on the board in the right rail; on phones it opens under
  // its card.
  import { ChevronLeft, ChevronRight, LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import BoardCard from '$lib/components/coach/BoardCard.svelte'
  import GradePill from '$lib/components/coach/GradePill.svelte'
  import GroupingPill from '$lib/components/coach/GroupingPill.svelte'
  import TakeCard from '$lib/components/coach/TakeCard.svelte'
  import VisitCards from '$lib/components/coach/VisitCards.svelte'
  import VisitTable from '$lib/components/coach/VisitTable.svelte'
  import { Button } from '$lib/components/ui/button'
  import { api, type CoachLegTitle } from '$lib/api'
  import { flag } from '$lib/flags'
  import {
    betterLine,
    dartRows,
    defaultVisit,
    GRADE_PILL,
    groupingLine,
    legHeading,
    coachedAs,
    legSubtitle,
    legSubtitleShort,
    missTags,
    signedPoints,
    valueLine,
  } from '$lib/coach/view'
  import { createRequestGuard } from '$lib/requestGuard'
  import type { LegReview, ReviewVisit, VisitGrade, VisitTag } from '$shared/coach'
  import { explainedNote } from '$shared/coach/grade'

  let { params }: { params: { gameId: string; leg: string } } = $props()

  const enabled = flag('coach.enabled')
  const debug = flag('coach.debug.enabled')
  const requests = createRequestGuard()
  const now = new Date()

  let review = $state<LegReview | null>(null)
  let title = $state<CoachLegTitle | null>(null)
  let phase = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  let selected = $state(1)
  let filter = $state<VisitTag | 'all'>('all')

  async function load(gameId: string, legParam: string) {
    const token = requests.start()
    const leg = Number(legParam)
    if (!Number.isInteger(leg) || leg < 0) {
      phase = 'missing'
      return
    }
    phase = 'loading'
    try {
      const res = await api.GET('/api/coach/legs/{gameId}/{leg}', { params: { path: { gameId, leg } } })
      if (!requests.isCurrent(token)) return
      if (!res.data) {
        phase = res.response.status === 404 ? 'missing' : 'failed'
        return
      }
      review = res.data.review
      title = res.data.title
      selected = res.data.review.visits[defaultVisit(res.data.review.visits)]?.n ?? 1
      filter = 'all'
      phase = 'ready'
    } catch {
      if (requests.isCurrent(token)) phase = 'failed'
    }
  }

  $effect(() => {
    if ($enabled) void load(params.gameId, params.leg)
  })

  const TAGS: { id: VisitTag | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'setup', label: 'Setup' },
    { id: 'doubling', label: 'Doubling' },
  ]
  const GRADES: VisitGrade[] = ['perfect', 'great', 'good', 'ok', 'weak', 'mistake']

  const visits = $derived(review?.visits ?? [])
  const shown = $derived(filter === 'all' ? visits : visits.filter(v => v.tag === filter))
  const tagCount = (id: VisitTag | 'all') => (id === 'all' ? visits.length : visits.filter(v => v.tag === id).length)
  const select = (n: number) => {
    selected = n
  }
  // The selection among the visits the chips show: the first shown when a chip hides the selected one
  const at = $derived(
    Math.max(
      shown.findIndex(v => v.n === selected),
      0,
    ),
  )
  const current = $derived(shown.at(at) ?? null)
  const prev = $derived(at > 0 ? (shown.at(at - 1) ?? null) : null)
  const next = $derived(shown.at(at + 1) ?? null)
</script>

{#snippet visitDetail(v: ReviewVisit)}
  {@const note = explainedNote(v.notes)}
  <div class="flex flex-col gap-3.5">
    <BoardCard
      darts={v.darts}
      selected={note?.dart ?? null}
      better={note ? { aimId: note.betterAimId, label: note.better } : null}
      misses={note ? missTags(note) : []}
    />
    <div class="flex flex-col gap-2 text-[13.5px] leading-[1.45]">
      <table class="w-full border-collapse text-[13px] tabular-nums">
        <caption class="sr-only">Visit {v.n}'s darts</caption>
        <thead>
          <tr class="text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
            <th scope="col" class="py-1 pr-2 font-semibold">Dart</th>
            <th scope="col" class="py-1 pr-2 font-semibold">Classification</th>
            <th scope="col" class="py-1 text-right font-semibold">Distance</th>
            {#if $debug}
              <th scope="col" class="py-1 pl-2 text-right font-semibold">Centre</th>
              <th scope="col" class="py-1 pl-2 text-right font-semibold">Δ</th>
              <th scope="col" class="py-1 pl-2 text-right font-semibold">Close</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each dartRows(v) as r, i (i)}
            {@const d = v.darts[i]}
            <tr class="border-t border-line align-top">
              <th scope="row" class="py-1.5 pr-2 text-left font-display text-[15px] font-bold">{r.name}</th>
              <td class="py-1.5 pr-2">
                {r.label}{#if r.near}
                  <span class="ml-1 inline-flex h-5 items-center rounded-full bg-good/15 px-2 text-[11px] font-bold text-good"
                    >Near miss</span
                  >{/if}
              </td>
              <td class="py-1.5 text-right whitespace-nowrap">{r.distance}</td>
              {#if $debug}
                <td class="py-1.5 pl-2 text-right">{d.class.miss?.mm.toFixed(1) ?? '–'}</td>
                <td class="py-1.5 pl-2 text-right">{d.delta === null ? '–' : signedPoints(d.delta)}</td>
                <td class="py-1.5 pl-2 text-right">{d.closeness === null ? '–' : `+${d.closeness.toFixed(1)}`}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
      {#if $debug}
        {#if valueLine(v)}<span class="text-text-muted"><b>Checkout chance:</b> {valueLine(v)}</span>{/if}
        <GroupingPill grouping={v.grouping} />
        {#if groupingLine(v)}<span class="text-text-muted">{groupingLine(v)}</span>{/if}
      {/if}
      {#if note}<span class="text-ice"><b>{note.tip ? 'Tip:' : 'Better:'}</b> {betterLine(note)}</span>{/if}
    </div>
    <div class="flex gap-2">
      {#if prev}
        <Button variant="outline" class="h-10 flex-1" onclick={() => select(prev.n)}><ChevronLeft size={16} />Visit {prev.n}</Button>
      {:else}<span class="flex-1"></span>{/if}
      {#if next}
        <Button variant="outline" class="h-10 flex-1" onclick={() => select(next.n)}>Visit {next.n}<ChevronRight size={16} /></Button>
      {:else}<span class="flex-1"></span>{/if}
    </div>
  </div>
{/snippet}

<Layout title="Coach">
  <main class="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto px-4 py-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    {#snippet breadcrumb()}
      <a href="#/coach" class="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold no-underline"
        ><ChevronLeft size={16} />Review</a
      >
    {/snippet}
    {#if !$enabled || phase !== 'ready'}{@render breadcrumb()}{/if}
    {#if !$enabled}
      <p class="m-0 text-[15px] text-text-muted">The coach isn't available yet.</p>
    {:else if phase === 'loading'}
      <p class="m-0 flex items-center gap-2 py-8 text-[15px] text-text-muted">
        <LoaderCircle size={18} class="animate-spin" /> Loading the leg…
      </p>
    {:else if phase === 'missing'}
      <div class="flex flex-col gap-2 py-8">
        <p class="m-0 text-[17px] font-semibold">This leg has no review</p>
        <a href="#/coach" class="text-[15px]">Back to the coach</a>
      </div>
    {:else if phase === 'failed' || !review || !title}
      <div role="alert" class="flex flex-wrap items-center gap-3 py-8">
        <p class="m-0 text-[15px] text-text-muted">Couldn't load the leg.</p>
        <Button variant="outline" onclick={() => void load(params.gameId, params.leg)}>Retry</Button>
      </div>
    {:else}
      <header class="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div class="flex flex-col gap-1.5">
          {@render breadcrumb()}
          <h1 class="m-0 font-display text-[30px] font-bold uppercase leading-none tracking-[0.02em] xl:text-[44px]">
            {legHeading(review.leg, title.opponents)}
          </h1>
          <span class="text-[13px] text-text-muted xl:hidden">{legSubtitleShort(title, review.darts, review.average, now)}</span>
          <span class="hidden text-[15px] text-text-muted xl:inline">{legSubtitle(title, review.darts, now)}</span>
          <span class="text-[13px] text-text-dim xl:text-[14px]">{coachedAs(review.coachLevel)}</span>
        </div>
        <Button variant="outline" href="#/history/{params.gameId}" class="h-11 text-[15px] font-semibold">Match details</Button>
      </header>

      <div
        class="flex flex-col gap-4 min-[1440px]:grid min-[1440px]:grid-cols-[minmax(0,1fr)_400px] min-[1440px]:items-start min-[1440px]:gap-5"
      >
        <div class="flex min-w-0 flex-col gap-4">
          <TakeCard take={review.take} skills={review.skills} grouping={review.grouping} />

          <section aria-label="Every visit" class="flex flex-col gap-2.5 xl:card xl:px-[22px] xl:py-5">
            <div class="hidden flex-wrap items-center gap-3.5 xl:flex">
              <h2 class="m-0 font-display text-[24px] font-bold uppercase">Every visit</h2>
              <ul class="m-0 ml-auto flex list-none flex-wrap gap-3.5 p-0" aria-label="Visits per grade">
                {#each GRADES as g (g)}
                  <li class="inline-flex items-center gap-1.5">
                    <GradePill grade={g} /><span class="text-[13px] text-text-muted"
                      ><span class="sr-only">{GRADE_PILL[g].label}: </span>{visits.filter(v => v.grade === g).length}</span
                    >
                  </li>
                {/each}
              </ul>
            </div>
            <div class="flex gap-1.5 overflow-x-auto xl:gap-2">
              {#each TAGS as t (t.id)}
                <button
                  type="button"
                  aria-pressed={filter === t.id}
                  onclick={() => (filter = t.id)}
                  class="inline-flex h-8 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-[inherit] text-[13px] {filter ===
                  t.id
                    ? 'border-line-popover bg-surface-paused font-semibold text-text'
                    : 'border-line-2 bg-transparent text-ink-2 hover:text-text'}"
                >
                  {t.label}<span class={t.id === 'all' ? '' : 'hidden xl:inline'}>{tagCount(t.id)}</span>
                </button>
              {/each}
            </div>
            {#if shown.length === 0}
              <p class="m-0 py-4 text-[14px] text-text-muted">No visits with this tag.</p>
            {:else}
              <div class="hidden xl:block"><VisitTable visits={shown} selected={current ? current.n : null} onselect={select} /></div>
              <div class="xl:hidden">
                {#key review}<VisitCards
                    visits={shown}
                    selected={current ? current.n : null}
                    onselect={select}
                    detail={visitDetail}
                  />{/key}
              </div>
            {/if}
          </section>
        </div>

        {#if current}
          <aside
            class="card hidden flex-col gap-3.5 px-[22px] py-5 xl:flex min-[1440px]:sticky min-[1440px]:top-6 min-[1440px]:max-h-[calc(100dvh-3rem)] min-[1440px]:overflow-y-auto"
            aria-label="Selected visit"
          >
            <div class="flex items-baseline justify-between">
              <h3 class="m-0 text-[16px] font-semibold">Visit {current.n} · {current.left} left</h3>
              <GradePill grade={current.grade} />
            </div>
            {@render visitDetail(current)}
          </aside>
        {/if}
      </div>
    {/if}
  </main>
</Layout>
