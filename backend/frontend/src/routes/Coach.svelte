<script lang="ts">
  // The Coach page's Review tab (Coach-Review): counts over your last 50 legs, then every coached leg,
  // filtered server-side, each opening its leg review. The filter lives in the querystring
  // (#/coach?filter=lost) so back and forward step through it.
  import { querystring } from 'svelte-spa-router'
  import { ChevronRight, Clock, LoaderCircle, Scan, Target } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import CountCards from '$lib/components/coach/CountCards.svelte'
  import { Button } from '$lib/components/ui/button'
  import { api, type CoachLegCounts, type CoachLegRow } from '$lib/api'
  import { flag, flagsLoaded } from '$lib/flags'
  import Pill from '$lib/components/coach/Pill.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import LegRowsSkeleton from '$lib/components/coach/LegRowsSkeleton.svelte'
  import ListSkeleton from '$lib/components/coach/ListSkeleton.svelte'
  import { Chip } from '$lib/components/ui/chip'
  import { COACH_FILTERS, COACH_FILTER_IDS, LEG_COLUMNS as COLUMNS, coachFound, legWhen, vsLine, type CoachFilter } from '$lib/coach/list'
  import { readParam } from '$lib/urlState'
  import { formatWhen } from '$lib/history'
  import { createRequestGuard } from '$lib/requestGuard'

  const enabled = flag('coach.enabled')
  const requests = createRequestGuard()
  const filter = $derived<CoachFilter>(readParam($querystring, 'filter', COACH_FILTER_IDS, 'all'))

  let counts = $state<CoachLegCounts | null>(null)
  let legs = $state<CoachLegRow[]>([])
  let nextCursor = $state<string | null>(null)
  let updatedAt = $state<string | null>(null)
  let loading = $state(true)
  let loadingMore = $state(false)
  let error = $state('')
  let loadMoreError = $state('')
  // The first request is slow while the server reviews games (after an update): say so after a moment
  let slow = $state(false)
  // How many of your latest games the server still has to review; while some do, the page asks again
  let pending = $state(0)
  let loads = $state(0)
  const now = new Date()

  const when = (iso: string) => legWhen(iso, now)
  const updated = $derived.by(() => {
    if (!updatedAt) return null
    const w = formatWhen(updatedAt, now)
    return w.day === 'Today' ? w.time : `${w.day} ${w.time}`
  })

  async function load(f: CoachFilter, cursor: string | null, token: number) {
    const { data } = await api.GET('/api/coach/legs', { params: { query: { filter: f, ...(cursor !== null && { cursor }) } } })
    if (!requests.isCurrent(token)) return // a newer filter took over
    if (!data) throw new Error("Couldn't load your legs")
    counts = data.counts
    updatedAt = data.updatedAt
    legs = cursor === null ? data.legs : [...legs, ...data.legs]
    nextCursor = data.nextCursor
    pending = data.pending
    loads++
  }

  /** Loads the first page for filter `f`, replacing the list */
  function reload(f: CoachFilter) {
    const token = requests.start()
    loading = true
    loadingMore = false
    error = ''
    loadMoreError = ''
    slow = false
    const slowTimer = setTimeout(() => (slow = true), 1500)
    load(f, null, token)
      .catch((e: unknown) => {
        if (requests.isCurrent(token)) error = e instanceof Error ? e.message : "Couldn't load your legs"
      })
      .finally(() => {
        clearTimeout(slowTimer)
        if (requests.isCurrent(token)) loading = false
      })
  }

  // While the server is still reviewing recent games, ask again: each request reviews up to 10 more.
  // The first page comes back in place, without the skeleton; a failed ask stops asking.
  $effect(() => {
    // `loads` too: another ask that leaves `pending` where it was still asks again
    if (pending === 0 || loads === 0 || loading || loadingMore) return
    const token = requests.current()
    const f = filter
    const timer = setTimeout(() => {
      load(f, null, token).catch(() => {
        if (requests.isCurrent(token)) pending = 0
      })
    }, 1000)
    return () => clearTimeout(timer)
  })

  // A new filter (or the flag turning on) starts over
  $effect(() => {
    if ($enabled) reload(filter)
  })

  async function more() {
    if (nextCursor === null || loadingMore) return
    const token = requests.current()
    loadingMore = true
    loadMoreError = ''
    try {
      await load(filter, nextCursor, token)
    } catch (e) {
      if (requests.isCurrent(token)) loadMoreError = e instanceof Error ? e.message : "Couldn't load more legs"
    } finally {
      if (requests.isCurrent(token)) loadingMore = false
    }
  }
</script>

{#snippet resultPill(won: boolean)}<Pill label={won ? 'Won' : 'Lost'} tone={won ? 'lime' : 'bad'} />{/snippet}

{#snippet found(row: CoachLegRow)}
  <span class="flex flex-wrap gap-1.5">
    {#each coachFound(row) as p (p.label)}<Pill {...p} />{/each}
  </span>
{/snippet}

{#snippet review(row: CoachLegRow, first: boolean)}
  <Button
    href="#/coach/leg/{row.gameId}/{row.leg}"
    variant={first ? 'accent' : 'outline'}
    class="h-[38px] gap-1.5 text-[15px] font-semibold"
    aria-label="Review {vsLine(row.opponents)}, {row.context}"
  >
    <Scan size={16} />Review
  </Button>
{/snippet}

<Layout title="Coach">
  <main class="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto px-4 py-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div class="flex flex-col gap-1.5">
        <h1 class="m-0 hidden font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em] md:block">Coach</h1>
        <p class="m-0 text-[15px] text-text-muted">A second look at any of your last 50 X01 legs.</p>
      </div>
      {#if $enabled && updated}
        <span class="flex items-center gap-2 text-[13px] text-text-dim"><Clock size={14} />Updated after your last game · {updated}</span>
      {/if}
    </header>

    {#if !$enabled && !$flagsLoaded}
      <ListSkeleton />
    {:else if !$enabled}
      <p class="m-0 text-[15px] text-text-muted">The coach isn't available yet.</p>
    {:else}
      <nav aria-label="Coach" class="flex gap-[30px] border-b border-surface-paused">
        <a
          href="#/coach"
          aria-current="page"
          class="-mb-px flex items-center gap-3 border-b-[3px] border-accent px-1.5 pb-3.5 text-text no-underline hover:text-text"
        >
          <Scan size={22} class="text-accent" />
          <span class="font-display text-[28px] font-bold uppercase leading-none tracking-[0.02em] md:text-[34px]">Review</span>
          {#if counts}
            <Pill label="{counts.legs} {counts.legs === 1 ? 'leg' : 'legs'}" tone="plain" />
          {/if}
        </a>
      </nav>

      {#if pending > 0 && !loading}
        <p role="status" class="m-0 flex items-center gap-2 text-[14px] text-text-muted">
          <LoaderCircle size={16} class="animate-spin motion-reduce:animate-none" />Reviewing your latest games… {pending} to go
        </p>
      {/if}

      {#if counts?.legs === 0 && pending === 0}
        <EmptyState title="Nothing to review yet" text="Play an X01 game with double out to get a review.">
          {#snippet icon()}<Target size={24} />{/snippet}
          {#snippet actions()}<a class="underline" href="#/play">Play</a>{/snippet}
        </EmptyState>
      {:else}
        {#if counts || loading}<CountCards {counts} />{/if}

        <section aria-label="Legs" class="card flex flex-col gap-3 p-4 md:px-[22px] md:py-5">
          <div class="flex flex-wrap items-center gap-2">
            {#each COACH_FILTERS as f (f.id)}
              <Chip variant="plain" href={f.id === 'all' ? '#/coach' : `#/coach?filter=${f.id}`} selected={f.id === filter}>{f.label}</Chip>
            {/each}
            <span class="ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-1">
              {#if counts}<span class="text-[13px] text-text-muted">X01 · double out · last {counts.legs} legs</span>{/if}
              <a href="#/coach/checks" class="inline-flex items-center text-[13px] font-semibold no-underline"
                >What the coach detects <ChevronRight size={14} /></a
              >
            </span>
          </div>

          {#if loading}
            <div aria-busy="true" class="flex flex-col gap-3">
              <p role="status" class="m-0 text-[14px] text-text-muted {slow ? '' : 'sr-only'}">
                {slow ? 'Reviewing your latest games… This can take a moment after an update.' : 'Loading your coach reviews…'}
              </p>
              <LegRowsSkeleton />
            </div>
          {:else if error}
            <div class="flex flex-wrap items-center gap-3 py-8">
              <ErrorText class="text-[15px]">{error}</ErrorText>
              <Button variant="outline" onclick={() => reload(filter)}>Retry</Button>
            </div>
          {:else if legs.length === 0}
            <p class="m-0 py-8 text-[15px] text-text-muted">No legs match this filter.</p>
          {:else}
            <div
              aria-hidden="true"
              class="hidden gap-3.5 px-3.5 pb-2.5 text-[12px] font-semibold label-caps text-text-dim lg:grid {COLUMNS}"
            >
              <span>When</span><span>Leg</span><span class="text-right">Result</span><span class="text-right">Darts</span><span
                class="text-right">Avg</span
              ><span>Coach found</span><span></span>
            </div>
            <ul class="m-0 flex list-none flex-col p-0">
              {#each legs as row, i (`${row.gameId}/${row.leg}`)}
                {@const title = vsLine(row.opponents)}
                {@const avg = row.average === null ? '–' : row.average.toFixed(1)}
                <li class="border-t border-surface-inset first:border-transparent {i === 0 ? 'rounded-[12px] bg-surface-drop' : ''}">
                  <!-- Desktop: one grid row per leg -->
                  <div class="hidden items-center gap-3.5 px-3.5 py-3 lg:grid {COLUMNS}">
                    <span class="text-[13px] text-text-muted">{when(row.finishedAt)}</span>
                    <span class="flex min-w-0 flex-col gap-0.5">
                      <span class="truncate text-[15px] font-semibold">{title}</span>
                      <span class="truncate text-[12.5px] text-text-dim">{row.context}</span>
                    </span>
                    <span class="justify-self-end">{@render resultPill(row.won)}</span>
                    <span class="text-right font-display text-[22px] font-bold"><span class="sr-only">Darts </span>{row.darts}</span>
                    <span class="text-right font-display text-[22px] font-bold"><span class="sr-only">Average </span>{avg}</span>
                    {@render found(row)}
                    <span class="justify-self-end">{@render review(row, i === 0)}</span>
                  </div>
                  <!-- Phones and tablets: the same fields, stacked -->
                  <div class="flex flex-col gap-2 p-3 lg:hidden">
                    <div class="flex items-start justify-between gap-3">
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate text-[15px] font-semibold">{title}</span>
                        <span class="truncate text-[12.5px] text-text-dim">{row.context} · {when(row.finishedAt)}</span>
                      </span>
                      {@render resultPill(row.won)}
                    </div>
                    <div class="flex items-baseline gap-4 text-[13px] text-text-muted">
                      <span><span class="font-display text-[20px] font-bold text-text">{row.darts}</span> darts</span>
                      <span><span class="font-display text-[20px] font-bold text-text">{avg}</span> avg</span>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      {@render found(row)}
                      {@render review(row, i === 0)}
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
            {#if nextCursor !== null}
              <div class="flex flex-col items-center gap-2 pt-1.5">
                <Button variant="outline" class="h-11 text-[15px] font-semibold" onclick={() => void more()} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Show 40 more legs'}
                </Button>
                {#if loadMoreError}<p role="alert" class="m-0 text-[13px] text-text-muted">{loadMoreError}</p>{/if}
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    {/if}
  </main>
</Layout>
