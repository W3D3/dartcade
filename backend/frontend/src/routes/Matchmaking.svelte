<script lang="ts">
  // Matchmaking (MM-Home board): your 1v1 and 2v2 ratings and ranks, online average and record,
  // the Find a match panel, and your last ranked games. Searching comes with the ranked queue;
  // until then Find match is off. Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md
  import { onMount } from 'svelte'
  import { Clock, Hourglass, LoaderCircle, Search, User, Users } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import StatCard from '$lib/components/ranked/StatCard.svelte'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'
  import { TIER_COLOR, fmtSeconds, ratingCard, record, recentRow } from '$lib/ranked/view'
  import { numberFlag } from '$lib/flags'
  import { RESERVE_SECONDS, VISIT_SECONDS } from '$shared/ranked.js'

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
    class="flex flex-grow flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
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
      <div class="flex justify-center py-10 text-text-muted"><LoaderCircle class="animate-spin" size={24} aria-label="Loading" /></div>
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
          value={profile.onlineAverage === null ? '–' : profile.onlineAverage.toFixed(1)}
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
            disabled
            class="mt-auto flex h-14 items-center justify-center gap-3 rounded-[14px] bg-accent font-display text-[22px] font-bold md:h-16 md:text-[26px] uppercase tracking-[0.06em] text-accent-fg opacity-40"
          >
            <Search size={24} />Find match
          </button>
          <span class="text-center text-[13px] text-text-muted">Searching for opponents is coming soon.</span>
        </section>

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
                  <Avatar name={r.name} size={30} />
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
