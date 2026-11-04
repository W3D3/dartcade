<script lang="ts">
  // One leg's review (Coach-Leg, Coach-Phone-Leg): the coach's take and skill letters, then every
  // visit graded. From xl the selected visit shows on the board in the right rail (40% wide, so its
  // board is big and the visit list still fits at 1280); on phones and tablets it opens under its card.
  import { ChevronLeft, ChevronRight, LoaderCircle } from '@lucide/svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import Layout from '$lib/components/Layout.svelte'
  import BoardCard from '$lib/components/coach/BoardCard.svelte'
  import GradePill from '$lib/components/coach/GradePill.svelte'
  import TakeCard from '$lib/components/coach/TakeCard.svelte'
  import VisitCards from '$lib/components/coach/VisitCards.svelte'
  import VisitDetail from '$lib/components/coach/VisitDetail.svelte'
  import VisitNumbers from '$lib/components/coach/VisitNumbers.svelte'
  import VisitTable from '$lib/components/coach/VisitTable.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Chip } from '$lib/components/ui/chip'
  import { api, type CoachLegTitle } from '$lib/api'
  import { flag } from '$lib/flags'
  import { coachedAs, defaultVisit, legHeading, legSubtitle, legSubtitleShort } from '$lib/coach/leg'
  import { GRADE_STYLE } from '$lib/coach/tone'
  import { createRequestGuard } from '$lib/requestGuard'
  import { VISIT_GRADES, type LegReview, type ReviewVisit, type VisitTag } from '$shared/coach'

  let { params }: { params: { gameId: string; leg: string } } = $props()

  const enabled = flag('coach.enabled')
  const debug = flag('coach.debug.enabled')
  const requests = createRequestGuard()
  const now = new Date()
  // From xl: the visit table and the rail; below it the cards
  const wide = new MediaQuery('min-width: 1280px')

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

  const visits = $derived(review?.visits ?? [])
  const shown = $derived(filter === 'all' ? visits : visits.filter(v => v.tag === filter))
  const tagCount = (id: VisitTag | 'all') => (id === 'all' ? visits.length : visits.filter(v => v.tag === id).length)
  const select = (n: number) => (selected = n)
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
  <div class="flex flex-col gap-3.5">
    <BoardCard darts={v.darts} note={v.explained} />
    <VisitDetail visit={v} />
    {#if $debug}<VisitNumbers visit={v} />{/if}
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
          <span class="text-[13px] text-text-muted xl:text-[15px]"
            >{wide.current ? legSubtitle(title, review.darts, now) : legSubtitleShort(title, review.darts, review.average, now)}</span
          >
          <span class="text-[13px] text-text-dim xl:text-[14px]">{coachedAs(review.coachLevel)}</span>
        </div>
        <Button variant="outline" href="#/history/{params.gameId}" class="h-11 text-[15px] font-semibold">Match details</Button>
      </header>

      <div class="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(380px,40%)] xl:items-start xl:gap-5">
        <div class="flex min-w-0 flex-col gap-4">
          <TakeCard take={review.take} skills={review.skills} grouping={review.grouping} />

          <section aria-label="Every visit" class="flex flex-col gap-2.5 xl:card xl:px-[22px] xl:py-5">
            {#if wide.current}<div class="flex flex-wrap items-center gap-3.5">
              <h2 class="m-0 font-display text-[24px] font-bold uppercase">Every visit</h2>
              <ul class="m-0 ml-auto flex list-none flex-wrap gap-3.5 p-0" aria-label="Visits per grade">
                {#each VISIT_GRADES as g (g)}
                  <li class="inline-flex items-center gap-1.5">
                    <GradePill grade={g} /><span class="text-[13px] text-text-muted"
                      ><span class="sr-only">{GRADE_STYLE[g].label}: </span>{visits.filter(v => v.grade === g).length}</span
                    >
                  </li>
                {/each}
              </ul>
            </div>{/if}
            <div class="flex gap-1.5 overflow-x-auto xl:gap-2">
              {#each TAGS as t (t.id)}
                <Chip variant="plain" selected={filter === t.id} onclick={() => (filter = t.id)}>
                  {t.label}{#if t.id === 'all' || wide.current}<span>{tagCount(t.id)}</span>{/if}
                </Chip>
              {/each}
            </div>
            {#if shown.length === 0}
              <p class="m-0 py-4 text-[14px] text-text-muted">No visits with this tag.</p>
            {:else if wide.current}
              <VisitTable visits={shown} selected={current ? current.n : null} onselect={select} />
            {:else}
              {#key review}<VisitCards visits={shown} selected={current ? current.n : null} onselect={select} detail={visitDetail} />{/key}
            {/if}
          </section>
        </div>

        {#if current && wide.current}
          <aside
            class="card sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col gap-3.5 overflow-y-auto px-[22px] py-5"
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
