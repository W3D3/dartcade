<script lang="ts">
  // Matchmaking (MM-Home board): your 1v1 and 2v2 ratings and ranks, online average and record,
  // the Find a match panel (Searching while your search runs: MM-Searching, MM-Duo), and your last
  // ranked games. A found match is prompted app-wide (MatchFound in App.svelte).
  // Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md
  import { fmtAvg } from '$lib/playerStats'
  import { onMount } from 'svelte'
  import { now as clockEvery } from '$lib/now'
  import { Check, Clock, Hourglass, MonitorSmartphone, Search, User, Users } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import SearchPanel from '$lib/components/ranked/SearchPanel.svelte'
  import StatCard from '$lib/components/ranked/StatCard.svelte'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'
  import { TIER_TEXT, fmtSeconds, playingOn, ratingCard, record, recentRow } from '$lib/ranked/view'
  import { numberFlag } from '$lib/flags'
  import { RESERVE_SECONDS, VISIT_SECONDS } from '$shared/ranked.js'
  import { me } from '$lib/lobby/sockets'
  import { duoLobbyReady, pausedFor, startSearch } from '$lib/ranked/queue'

  type Profile = components['schemas']['RankedProfile']

  let profile = $state<Profile | null>(null)
  let error = $state('')
  let boards = $state<{ name: string; online: boolean }[]>([])
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
    const [ranked, owned] = await Promise.all([api.GET('/api/ranked/me'), api.GET('/api/boards')])
    if (ranked.data) profile = ranked.data
    else error = ranked.error.error
    boards = owned.data?.boards ?? []
  })
  const board = $derived(playingOn(boards))
  const duoReady = $derived(duoLobbyReady($me?.lobby ?? null))

  // The search runs on the server; its clock and range tick here
  const tick = clockEvery(1000)

  const search = $derived($me?.matchmaking?.search ?? null)
  const paused = $derived(pausedFor($me?.matchmaking?.pausedUntil ?? null, $tick))
  let busy = $state(false)
  let searchError = $state('')

  async function find() {
    busy = true
    try {
      searchError = (await startSearch(queue, firstTo)) ?? ''
    } finally {
      busy = false
    }
  }

  const queues = [
    { id: '1v1', title: 'Solo · 1v1', line: 'Matched by your 1v1 rating', short: 'By your 1v1 rating', hint: '' },
    {
      id: '2v2',
      title: 'Duo · 2v2',
      line: 'You and one lobby mate vs another duo',
      short: 'With one lobby mate',
      hint: 'Needs a lobby of exactly 2',
    },
  ] as const
  const formats = [
    { value: 2, label: 'First to 2 legs', hint: '~15 min' },
    { value: 3, label: 'First to 3 legs', hint: '~25 min' },
  ] as const
</script>

{#snippet boardChip()}
  {#if board}
    <span
      class="inline-flex h-[30px] items-center gap-[7px] whitespace-nowrap rounded-full border border-line-chip px-3 text-[13px] font-medium text-ink-2"
      title={board.online ? 'Board connected' : 'Board offline'}
      ><span class="size-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>{board.name}</span
    >
  {/if}
{/snippet}

<Layout title="Ranked" headerAction={boardChip}>
  <main
    class="flex grow min-h-0 flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
  >
    <header class="flex items-end justify-between gap-6">
      <div class="flex flex-col gap-[6px]">
        <h1 class="hidden md:block font-display font-bold text-[42px] xl:text-[48px] leading-none uppercase tracking-title">Matchmaking</h1>
        <p class="text-[15px] text-text-muted">
          Ranked X01 against players near your level. Wins and losses move your rating and rank.
          <a href="#/matchmaking/ranks" class="whitespace-nowrap font-semibold text-accent no-underline">See all ranks</a>
        </p>
      </div>
      <span class="hidden shrink-0 md:block">{@render boardChip()}</span>
    </header>

    {#if error}<ErrorText>{error}</ErrorText>{/if}
    <!-- A running search can be cancelled even when the profile did not load -->
    {#if search && !profile}<SearchPanel />{/if}

    {#if !profile && !error}
      <PageLoading />
    {:else if profile && rec}
      <div class="grid grid-cols-2 gap-[10px] md:gap-[14px] lg:grid-cols-[1.15fr_1.15fr_1fr_0.9fr]">
        {#each cards as card (card.label)}
          <StatCard label={card.label} value={card.rating} unit={card.unit} aria="{card.label}: {card.rating} {card.unit}">
            <span
              class="text-[12px] font-semibold md:text-[14px] md:whitespace-nowrap"
              style:color={card.rank ? TIER_TEXT[card.rank.tier] : undefined}
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
        {#if search}
          <SearchPanel />
        {:else}
          <section
            aria-label="Find a match"
            class="box-border flex flex-col gap-3 rounded-popover border border-line bg-surface-panel p-4 md:gap-4 md:px-6 md:py-5"
          >
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-display text-[22px] font-bold uppercase tracking-[0.03em] md:text-[28px]">Find a match</h2>
              <span class="text-right text-[12px] text-text-muted md:text-[13px]"
                ><span class="hidden md:inline">X01 ·&nbsp;</span>501 · Double out</span
              >
            </div>

            <RadioGroup
              value={queue}
              onValueChange={(v: string) => (queue = v === '2v2' ? '2v2' : '1v1')}
              orientation="horizontal"
              aria-label="Queue"
              class="grid grid-cols-2 gap-[10px] md:gap-3"
            >
              {#each queues as opt (opt.id)}
                {@const on = queue === opt.id}
                {@const needsLobby = opt.id === '2v2' && !duoReady}
                <!-- The hint's link can't sit inside the option (a button), so it floats over the card's foot -->
                <div class="relative flex min-w-0 flex-col">
                  <RadioGroupItem value={opt.id} variant="card" class={needsLobby ? 'grow pb-9' : 'grow'}>
                    <span class="flex items-center gap-[10px]">
                      <span class="hidden md:flex {on ? 'text-accent' : 'text-text-muted'}">
                        {#if opt.id === '1v1'}<User size={20} />{:else}<Users size={20} />{/if}
                      </span>
                      <span class="whitespace-nowrap font-display text-[19px] font-bold uppercase tracking-[0.03em] md:text-[22px]"
                        >{opt.title}</span
                      >
                      {#if on}<Check size={18} class="ml-auto hidden text-accent md:block" aria-hidden="true" />{/if}
                    </span>
                    <span class="text-[12px] text-text-muted md:text-[13px]"
                      ><span class="md:hidden">{opt.short}</span><span class="hidden md:inline">{opt.line}</span></span
                    >
                  </RadioGroupItem>
                  {#if needsLobby}
                    <span class="absolute bottom-2 left-3 text-[11px] text-warn md:bottom-3 md:left-[14px] md:text-[12px]">
                      <span class="hidden md:inline">{opt.hint} · </span><a href="#/lobby" class="font-semibold text-warn underline"
                        ><span class="md:hidden">Create a lobby of 2</span><span class="hidden md:inline">create one</span></a
                      >
                    </span>
                  {/if}
                </div>
              {/each}
            </RadioGroup>

            <RadioGroup
              value={String(firstTo)}
              onValueChange={(v: string) => (firstTo = v === '3' ? 3 : 2)}
              orientation="horizontal"
              aria-label="Format"
              class="hidden md:flex md:flex-wrap md:items-center gap-2"
            >
              <span class="mr-1 hidden text-[13px] text-text-muted md:inline">Format</span>
              {#each formats as f (f.value)}
                <RadioGroupItem value={String(f.value)} variant="chip">
                  {f.label}<span class="hidden text-[12px] font-normal text-text-dim md:inline">{f.hint}</span>
                </RadioGroupItem>
              {/each}
            </RadioGroup>
            <SegmentedControl
              label="Format"
              class="md:hidden"
              options={formats.map(f => ({ value: f.value, label: f.label }))}
              value={firstTo}
              onchange={v => (firstTo = v === 3 ? 3 : 2)}
            />

            <span class="flex items-center justify-center gap-2 text-[12px] text-ink-2 md:hidden"
              ><Clock size={14} class="shrink-0" />{visit} · {reserve}</span
            >
            <div class="hidden flex-col gap-2 rounded-lg border border-line bg-surface-1 px-[14px] py-3 text-[13px] text-ink-2 md:flex">
              <span class="flex items-start gap-2"
                ><Clock size={16} class="mt-px shrink-0" /><span
                  ><strong class="font-semibold whitespace-nowrap text-text">{visit}</strong>
                  <span class="text-text-dim">· starts once the board is clear</span></span
                ></span
              >
              <span class="flex items-start gap-2"
                ><Hourglass size={16} class="mt-px shrink-0" /><span
                  ><strong class="font-semibold whitespace-nowrap text-text">{reserve}</strong>
                  <span class="text-text-dim">· only used once a visit runs over; at 0:00 you forfeit</span></span
                ></span
              >
            </div>

            <div class="flex items-center gap-[10px] text-[12px] text-ink-2 md:text-[14px]">
              <Search size={16} class="shrink-0" />
              <span
                >Starts within <strong class="font-mono font-medium text-text">±75 RP</strong> of your rating
                <span class="text-text-dim">· widens while you wait</span></span
              >
            </div>

            <div class="hidden items-center gap-[10px] text-[14px] text-ink-2 md:flex">
              <MonitorSmartphone size={16} class="shrink-0" />
              {#if board}
                Playing on
                <span class="inline-flex items-center gap-[6px] font-semibold text-text"
                  ><span class="size-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>{board.name}</span
                >
                <span class="text-text-dim">· {board.online ? 'auto-scoring' : 'offline, darts by hand'}</span>
              {:else}
                No board paired <span class="text-text-dim">· darts by hand</span>
              {/if}
              <a href="#/settings/boards" class="ml-auto font-semibold text-accent no-underline">{board ? 'Change' : 'Add a board'}</a>
            </div>

            <button
              type="button"
              disabled={busy || paused !== null || (queue === '2v2' && !duoReady)}
              onclick={find}
              class="mt-auto flex h-14 cursor-pointer items-center justify-center gap-3 rounded-card border-0 bg-accent font-display text-[22px] font-bold md:h-16 md:text-[26px] uppercase tracking-wordmark text-accent-fg disabled:cursor-default disabled:opacity-40"
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
          class="box-border flex flex-col gap-[6px] rounded-popover border border-line bg-surface-panel p-4 md:px-[22px] md:py-5"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-[15px] font-semibold md:text-[16px]">Recent ranked<span class="hidden md:inline">&nbsp;matches</span></h2>
            <a href="#/history" class="text-[13px] font-semibold text-accent no-underline"
              >All<span class="hidden md:inline">&nbsp;in History</span></a
            >
          </div>
          {#if recent.length === 0}
            <p class="py-6 text-center text-[14px] text-text-muted">Your ranked matches show up here.</p>
          {:else}
            <ul class="flex flex-col">
              {#each recent as r (r.key)}
                <li class="flex min-h-14 items-center gap-3 border-b border-surface-paused last:border-b-0">
                  <span
                    aria-label={r.won ? 'Won' : 'Lost'}
                    class="flex size-[26px] shrink-0 items-center justify-center rounded-segment text-[13px] font-bold {r.won
                      ? 'bg-accent-tint text-accent'
                      : 'bg-live-soft text-live-text'}">{r.won ? 'W' : 'L'}</span
                  >
                  <span class="hidden md:block"><Avatar name={r.name} face={r.opponent} size={30} /></span>
                  <span class="flex min-w-0 grow flex-col gap-px">
                    <a href="#/history/{r.key}" class="truncate text-[14px] font-semibold text-text no-underline md:text-[15px]">{r.name}</a
                    >
                    <span class="flex items-center gap-1 truncate text-[11px] text-text-dim md:text-[12px]">
                      <span class="truncate md:hidden">{r.day}</span>
                      <span class="hidden truncate md:inline">{r.meta}</span>
                      {#if r.opponentRank}<span class="hidden md:flex"><RankBadge rank={r.opponentRank} size={16} /></span>{/if}
                    </span>
                  </span>
                  {#if r.score}<span class="whitespace-nowrap font-display text-[19px] font-bold text-ink-2 md:text-[22px]">{r.score}</span
                    >{/if}
                  <span
                    class="min-w-9 shrink-0 whitespace-nowrap text-right md:min-w-11 {r.placement
                      ? 'text-[12px] text-text-dim'
                      : `font-mono text-[13px] font-medium md:text-[14px] ${r.won ? 'text-accent' : 'text-live-text'}`}">{r.change}</span
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
