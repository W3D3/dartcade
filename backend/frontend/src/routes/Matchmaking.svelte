<script lang="ts">
  // Matchmaking (MM-Home board): your 1v1 and 2v2 ratings and ranks, online average and record,
  // the Find a match panel (Searching while your search runs: MM-Searching, MM-Duo), and your last
  // ranked games. A found match is prompted app-wide (MatchFound in App.svelte).
  // Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md
  import { fmtAvg } from '$lib/playerStats'
  import { onDestroy, onMount } from 'svelte'
  import { Clock, Crosshair, Hourglass, Search, User, Users, X } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import StatCard from '$lib/components/ranked/StatCard.svelte'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'
  import { TIER_COLOR, fmtSeconds, ratingCard, record, recentRow } from '$lib/ranked/view'
  import { numberFlag } from '$lib/flags'
  import { RESERVE_SECONDS, VISIT_SECONDS } from '$shared/ranked.js'
  import { me } from '$lib/lobby/sockets'
  import { currentUser } from '$lib/auth'
  import { cancelSearch, pausedFor, searchView, startSearch } from '$lib/ranked/queue'

  type Profile = components['schemas']['RankedProfile']

  let profile = $state<Profile | null>(null)
  let error = $state('')
  let queue = $state<'1v1' | '2v2'>('1v1')
  let firstTo = $state<2 | 3>(2)

  const cards = $derived(profile ? profile.ratings.map(ratingCard) : [])
  const rec = $derived(profile ? record(profile.ratings) : null)
  const now = new Date()
  const recent = $derived(profile ? profile.recent.map(g => recentRow(g, now)) : [])
  const visitSeconds = numberFlag('matchmaking.visitSeconds', VISIT_SECONDS)
  const reserveSeconds = numberFlag('matchmaking.reserveSeconds', RESERVE_SECONDS)
  const visit = $derived(`${fmtSeconds($visitSeconds)} per visit`)
  const reserve = $derived(`${fmtSeconds($reserveSeconds)} reserve each`)

  onMount(async () => {
    const { data, error: err } = await api.GET('/api/ranked/me')
    if (data) profile = data
    else error = err.error
  })

  // The search runs on the server; its clock and range tick here
  let tick = $state(Date.now())
  const ticker = setInterval(() => (tick = Date.now()), 1000)
  onDestroy(() => clearInterval(ticker))

  const search = $derived($me?.matchmaking?.search ?? null)
  const searching = $derived(search ? searchView(search, tick) : null)
  const youHost = $derived(search !== null && search.hostUserId === $currentUser?.id)
  const paused = $derived(pausedFor($me?.matchmaking?.pausedUntil ?? null, tick))
  let busy = $state(false)
  let searchError = $state('')

  async function find() {
    busy = true
    searchError = (await startSearch(queue, firstTo)) ?? ''
    busy = false
  }

  async function cancel() {
    busy = true
    searchError = (await cancelSearch()) ?? ''
    busy = false
  }

  const queues = [
    { id: '1v1', title: 'Solo · 1v1', line: 'Matched by your 1v1 rating', short: 'By your 1v1 rating', hint: '', hintShort: '' },
    {
      id: '2v2',
      title: 'Duo · 2v2',
      line: 'You and one lobby mate vs another duo',
      short: 'With one lobby mate',
      hint: 'Needs a lobby of exactly 2',
      hintShort: 'Needs a lobby of 2',
    },
  ] as const
  const formats = [
    { value: 2, label: 'First to 2 legs', hint: '~15 min' },
    { value: 3, label: 'First to 3 legs', hint: '~25 min' },
  ] as const
</script>

<Layout title="Matchmaking">
  <main
    class="flex flex-grow min-h-0 flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
  >
    <header class="flex flex-col gap-[6px]">
      <h1 class="m-0 hidden md:block font-display font-bold text-[42px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">
        Matchmaking
      </h1>
      <p class="m-0 text-[15px] text-text-muted">
        Ranked X01 against players near your level. Wins and losses move your rating and rank.
        <a href="#/matchmaking/ranks" class="whitespace-nowrap font-semibold text-accent no-underline">See all ranks</a>
      </p>
    </header>

    {#if error}<ErrorText>{error}</ErrorText>{/if}

    {#if !profile && !error}
      <PageLoading />
    {:else if profile && rec}
      <div class="grid grid-cols-2 gap-[10px] md:gap-[14px] lg:grid-cols-[1.15fr_1.15fr_1fr_0.9fr]">
        {#each cards as card (card.label)}
          <StatCard label={card.label} value={card.rating} unit={card.unit} aria="{card.label}: {card.rating} {card.unit}">
            <span
              class="text-[12px] font-semibold md:text-[14px] md:whitespace-nowrap"
              style:color={card.rank ? TIER_COLOR[card.rank.tier] : undefined}
              >{card.title}<span class="font-normal text-text-dim {card.rank ? '' : 'hidden md:inline'}">&nbsp;{card.progress}</span></span
            >
            <span class="text-[11px] md:text-[13px] md:whitespace-nowrap {card.trendUp ? 'text-accent' : 'text-text-muted'}"
              ><span class="md:hidden">{card.trendShort}</span><span class="hidden md:inline">{card.trend}</span></span
            >
            {#snippet corner()}<span class="md:hidden"><RankBadge rank={card.rank} size={34} /></span><span class="hidden md:block"
                ><RankBadge rank={card.rank} size={52} /></span
              >{/snippet}
          </StatCard>
        {/each}
        <StatCard
          label="Online average"
          shortLabel="Online avg"
          value={fmtAvg(profile.onlineAverage)}
          aria="Online average: {profile.onlineAverage ?? 'none yet'}"
        >
          <span class="text-[11px] text-text-muted md:text-[13px] md:whitespace-nowrap"
            ><span class="md:hidden">Last 20 ranked</span><span class="hidden md:inline">Ranked, last 20 matches</span></span
          >
        </StatCard>
        <StatCard label="Record" value={rec.score} aria="Record: {rec.score}">
          <span class="text-[11px] text-text-muted md:text-[13px] md:whitespace-nowrap"
            ><span class="md:hidden">{rec.short}</span><span class="hidden md:inline">{rec.line}</span></span
          >
        </StatCard>
      </div>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {#if search && searching}
          <section
            aria-label={searching.title}
            aria-live="polite"
            class="box-border flex flex-col gap-4 rounded-[16px] border-2 border-accent-line bg-surface-panel px-4 py-4 md:px-6 md:py-[22px]"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 class="m-0 font-display text-[22px] font-bold uppercase tracking-[0.03em] md:text-[28px]">{searching.title}</h2>
              <span class="text-[12px] text-text-muted md:text-[13px]">{searching.format}</span>
            </div>
            <div class="flex flex-grow items-center gap-5 md:gap-7 md:px-1 md:py-[6px]">
              <div class="relative h-[120px] w-[120px] flex-shrink-0 md:h-[176px] md:w-[176px]">
                {#each [0, 0.8, 1.6] as delay (delay)}
                  <span
                    aria-hidden="true"
                    class="absolute inset-0 animate-radar rounded-full border-2 border-accent opacity-0 motion-reduce:hidden"
                    style:animation-delay="{delay}s"
                  ></span>
                {/each}
                <span
                  class="absolute inset-[22%] flex flex-col items-center justify-center gap-[2px] rounded-full border border-accent-line bg-surface-1"
                >
                  <Crosshair size={18} class="text-accent" />
                  <span role="timer" aria-label="Time searching" class="font-display text-[22px] font-bold leading-none md:text-[28px]"
                    >{searching.elapsed}</span
                  >
                </span>
              </div>
              <div class="flex min-w-0 flex-grow flex-col gap-[14px]">
                {#if search.mode === '2v2'}
                  <span class="truncate text-[14px] font-semibold">{searching.players}</span>
                {/if}
                <div class="flex flex-col gap-1">
                  <span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Rating range</span>
                  <span class="text-[15px]"
                    ><strong class="font-mono font-medium">{searching.range}</strong>
                    <span class="text-text-muted">· widens every 30 s</span></span
                  >
                </div>
                {#if searching.bar}
                  <div class="flex w-full flex-col gap-2">
                    <div class="relative h-[10px] rounded-[5px] bg-surface-chip">
                      <span
                        class="absolute top-0 bottom-0 rounded-[5px] border border-accent-line-strong bg-accent-line transition-[left,right] duration-700"
                        style:left="{searching.bar.inset}%"
                        style:right="{searching.bar.inset}%"
                      ></span>
                      <span class="absolute top-[-5px] left-1/2 -ml-[2px] h-5 w-1 rounded-[2px] bg-accent"></span>
                    </div>
                    <div class="flex justify-between gap-2 font-mono text-[11px] text-text-dim md:text-[12px]">
                      <span>{searching.bar.low}</span><span class="truncate text-accent">{searching.bar.you}</span><span
                        >{searching.bar.high}</span
                      >
                    </div>
                  </div>
                {/if}
                <span class="text-[13px] text-text-muted">{searching.searching}</span>
              </div>
            </div>
            <div class="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-4">
              <span class="flex-grow text-[13px] leading-[1.45] text-text-muted">
                {#if search.mode === '2v2' && !youHost}
                  Only your duo's host can cancel. When a match is found, you get 10 seconds to accept on any screen.
                {:else}
                  Keep browsing. When a match is found, you get 10 seconds to accept on any screen.
                {/if}
              </span>
              {#if search.mode === '1v1' || youHost}
                <button
                  type="button"
                  disabled={busy}
                  onclick={cancel}
                  class="flex h-[52px] flex-shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-line-strong bg-transparent px-[22px] font-[inherit] text-[15px] font-semibold text-text"
                >
                  <X size={18} />Cancel search
                </button>
              {/if}
            </div>
            {#if searchError}<ErrorText>{searchError}</ErrorText>{/if}
          </section>
        {:else}
          <section
            aria-label="Find a match"
            class="box-border flex flex-col gap-3 rounded-[16px] border border-line bg-surface-panel px-4 py-4 md:gap-4 md:px-6 md:py-5"
          >
            <div class="flex items-center justify-between gap-3">
              <h2 class="m-0 font-display text-[22px] font-bold uppercase tracking-[0.03em] md:text-[28px]">Find a match</h2>
              <span class="text-right text-[12px] text-text-muted md:text-[13px]"
                ><span class="hidden md:inline">X01 ·&nbsp;</span>501 · Double out</span
              >
            </div>

            <div role="radiogroup" aria-label="Queue" class="grid grid-cols-2 gap-[10px] md:gap-3">
              {#each queues as opt (opt.id)}
                {@const on = queue === opt.id}
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onclick={() => (queue = opt.id)}
                  class="box-border flex min-w-0 cursor-pointer flex-col gap-1 rounded-[12px] px-3 py-[10px] text-left font-[inherit] md:min-h-[84px] md:px-[14px] md:py-3 {on
                    ? 'border-2 border-accent bg-surface-active text-text'
                    : 'border border-line-chip bg-transparent text-ink-2'}"
                >
                  <span class="flex items-center gap-[10px]">
                    <span class="hidden md:flex {on ? 'text-accent' : 'text-text-muted'}">
                      {#if opt.id === '1v1'}<User size={20} />{:else}<Users size={20} />{/if}
                    </span>
                    <span class="whitespace-nowrap font-display text-[19px] font-bold uppercase tracking-[0.03em] md:text-[22px]"
                      >{opt.title}</span
                    >
                  </span>
                  <span class="text-[12px] text-text-muted md:text-[13px]"
                    ><span class="md:hidden">{opt.short}</span><span class="hidden md:inline">{opt.line}</span></span
                  >
                  {#if opt.hint}<span class="text-[11px] text-warn md:text-[12px]"
                      ><span class="md:hidden">{opt.hintShort}</span><span class="hidden md:inline">{opt.hint}</span></span
                    >{/if}
                </button>
              {/each}
            </div>

            <div role="radiogroup" aria-label="Format" class="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
              <span class="mr-1 hidden text-[13px] text-text-muted md:inline">Format</span>
              {#each formats as f (f.value)}
                {@const on = firstTo === f.value}
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onclick={() => (firstTo = f.value)}
                  class="flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-3 font-[inherit] text-[13px] font-semibold md:px-[14px] md:text-[14px] {on
                    ? 'border border-accent-line-strong bg-surface-paused text-text'
                    : 'border border-line-chip bg-transparent text-ink-2'}"
                >
                  {f.label}<span class="hidden text-[12px] font-normal text-text-dim md:inline">{f.hint}</span>
                </button>
              {/each}
            </div>

            <span class="flex items-center justify-center gap-2 text-[12px] text-ink-2 md:hidden"
              ><Clock size={14} class="flex-shrink-0" />{visit} · {reserve}</span
            >
            <div class="hidden flex-col gap-2 rounded-[12px] border border-line bg-surface-1 px-[14px] py-3 text-[13px] text-ink-2 md:flex">
              <span class="flex items-start gap-2"
                ><Clock size={16} class="mt-px flex-shrink-0" /><span
                  ><strong class="font-semibold whitespace-nowrap text-text">{visit}</strong>
                  <span class="text-text-dim">· starts once the board is clear</span></span
                ></span
              >
              <span class="flex items-start gap-2"
                ><Hourglass size={16} class="mt-px flex-shrink-0" /><span
                  ><strong class="font-semibold whitespace-nowrap text-text">{reserve}</strong>
                  <span class="text-text-dim">· only used once a visit runs over; at 0:00 you forfeit</span></span
                ></span
              >
            </div>

            <div class="flex items-center gap-[10px] text-[12px] text-ink-2 md:text-[14px]">
              <Search size={16} class="flex-shrink-0" />
              <span
                >Starts within <strong class="font-mono font-medium text-text">±75 RP</strong> of your rating
                <span class="text-text-dim">· widens while you wait</span></span
              >
            </div>

            <button
              type="button"
              disabled={busy || paused !== null}
              onclick={find}
              class="mt-auto flex h-14 cursor-pointer items-center justify-center gap-3 rounded-[14px] border-0 bg-accent font-display text-[22px] font-bold md:h-16 md:text-[26px] uppercase tracking-[0.06em] text-accent-fg disabled:cursor-default disabled:opacity-40"
            >
              <Search size={24} />Find match
            </button>
            {#if paused}
              <span class="text-center text-[13px] text-text-muted"
                >You declined a match: you can search again in <span class="font-mono">{paused}</span>.</span
              >
            {/if}
            {#if searchError}<ErrorText>{searchError}</ErrorText>{/if}
          </section>
        {/if}

        <section
          aria-label="Recent ranked matches"
          class="box-border flex flex-col gap-[6px] rounded-[16px] border border-line bg-surface-panel px-4 py-4 md:px-[22px] md:py-5"
        >
          <div class="flex items-center justify-between">
            <h2 class="m-0 text-[15px] font-semibold md:text-[16px]">Recent ranked<span class="hidden md:inline">&nbsp;matches</span></h2>
            <a href="#/history" class="text-[13px] font-semibold text-accent no-underline"
              >All<span class="hidden md:inline">&nbsp;in History</span></a
            >
          </div>
          {#if recent.length === 0}
            <p class="m-0 py-6 text-center text-[14px] text-text-muted">Your ranked matches show up here.</p>
          {:else}
            <ul class="m-0 flex list-none flex-col p-0">
              {#each recent as r (r.key)}
                <li class="flex min-h-14 items-center gap-3 border-b border-surface-paused last:border-b-0">
                  <span
                    aria-label={r.won ? 'Won' : 'Lost'}
                    class="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] text-[13px] font-bold {r.won
                      ? 'bg-accent-tint text-accent'
                      : 'bg-live-soft text-live-text'}">{r.won ? 'W' : 'L'}</span
                  >
                  <Avatar name={r.name} avatar={r.opponent?.avatar} userId={r.opponent?.userId} size={30} />
                  <span class="flex min-w-0 flex-grow flex-col gap-px">
                    <a href="#/history/{r.key}" class="truncate text-[15px] font-semibold text-text no-underline">{r.name}</a>
                    <span class="truncate text-[12px] text-text-dim">{r.meta}</span>
                  </span>
                  <span
                    class="min-w-11 flex-shrink-0 whitespace-nowrap text-right {r.placement
                      ? 'text-[12px] text-text-dim'
                      : `font-mono text-[14px] font-medium ${r.won ? 'text-accent' : 'text-live-text'}`}">{r.change}</span
                  >
                </li>
              {/each}
            </ul>
          {/if}
          <p class="m-0 mt-auto pt-2 text-[12px] text-text-dim">
            Ranked games also count in History and Statistics. Only ranked X01 moves your rating.
          </p>
        </section>
      </div>
    {/if}
  </main>
</Layout>
