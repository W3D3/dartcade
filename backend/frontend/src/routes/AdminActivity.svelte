<!-- Admin Activity page (`#/admin/activity`): who is on, signups, games per day, the busiest hours and what is
     running, counted from existing tables and live state; refreshed every 20 s while the tab is visible. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { RefreshCw } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { gameTitle } from '$shared/gameNames'
  import { activityTrail } from '$lib/admin/breadcrumbs'
  import ActivityBars, { type Series } from '$lib/components/admin/ActivityBars.svelte'
  import ActivityDrill from '$lib/components/admin/ActivityDrill.svelte'
  import ActivityHeatmap from '$lib/components/admin/ActivityHeatmap.svelte'
  import {
    GRANULARITIES,
    RANGES,
    bucketName,
    bucketRange,
    bucketize,
    busiestSlot,
    defaultGranularity,
    formatCount,
    loadActivity,
    modeColor,
    modeFill,
    percent,
    rangeLabel,
    trend,
    type AdminActivity,
    type Bucket,
    type DrillQuery,
    type Granularity,
    type Range,
  } from '$lib/admin/activity'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let days = $state<Range>(30)
  let granularity = $state<Granularity>('day')
  /** The point of a chart that was clicked: the panel under that chart lists what is behind it. */
  let drill = $state<{ chart: 'signups' | 'games' | 'heat'; title: string; query: DrillQuery } | null>(null)
  let activity = $state<AdminActivity | null>(null)
  let loadError = $state('')

  async function refresh(): Promise<void> {
    const asked = days
    const a = await loadActivity(asked)
    // A slower answer for a range the user already left must not replace the new one
    if (asked !== days) return
    if (!a) {
      loadError = "Couldn't load the activity."
      return
    }
    activity = a
    loadError = ''
  }
  function pick(next: Range): void {
    days = next
    granularity = defaultGranularity(next)
    drill = null
    void refresh()
  }
  function pickBucket(chart: 'signups' | 'games', b: Bucket): void {
    drill = { chart, title: bucketName(b, granularity), query: { metric: chart, ...bucketRange(b) } }
  }
  function pickCell(dow: number, hour: number): void {
    if (!activity) return
    const { from, to } = activity.busiestWindow
    drill = {
      chart: 'heat',
      title: `${WEEKDAYS[dow - 1]} ${hour}:00 UTC, last 4 weeks`,
      query: { metric: 'games', from, to, dow, hour },
    }
  }

  const REFRESH_MS = 20_000
  let timer: ReturnType<typeof setInterval> | undefined
  function schedule(): void {
    clearInterval(timer)
    timer = document.hidden ? undefined : setInterval(() => void refresh(), REFRESH_MS)
  }
  function onVisibility(): void {
    if (!document.hidden) void refresh()
    schedule()
  }
  onMount(() => {
    void refresh()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
  })
  onDestroy(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
</script>

{#snippet stat(label: string, value: string, note?: string, up?: boolean)}
  <div class="card p-4 flex flex-col gap-1">
    <div class="text-small text-text-muted">{label}</div>
    <div class="text-section-title font-bold leading-none">{value}</div>
    {#if note}<div class="text-small {up === undefined ? 'text-text-muted' : up ? 'text-accent' : 'text-danger-text'}">{note}</div>{/if}
  </div>
{/snippet}

{#snippet panel(id: string, title: string, sub: string | null)}
  <div class="flex flex-col gap-0.5">
    <h2 {id} class="text-body-lg font-semibold">{title}</h2>
    {#if sub}<p class="text-small text-text-muted">{sub}</p>{/if}
  </div>
{/snippet}

<Layout title="Activity">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <PageTitle as="div" trail={activityTrail()} title="Activity" sub="Who is on, what is played and what is running" />
        <div class="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Range" class="flex rounded-key border border-line-chip overflow-hidden">
            {#each RANGES as r (r)}
              <button
                type="button"
                class="h-11 px-3 sm:px-4 whitespace-nowrap text-label font-semibold {days === r
                  ? 'bg-accent text-accent-fg'
                  : 'text-text-muted hover:text-text'}"
                aria-pressed={days === r}
                onclick={() => pick(r)}>{rangeLabel(r)}</button
              >
            {/each}
          </div>
          <div role="group" aria-label="Group by" class="flex rounded-key border border-line-chip overflow-hidden">
            {#each GRANULARITIES as g (g)}
              <button
                type="button"
                class="h-11 px-3 sm:px-4 text-label font-semibold capitalize {granularity === g
                  ? 'bg-accent text-accent-fg'
                  : 'text-text-muted hover:text-text'}"
                aria-pressed={granularity === g}
                onclick={() => {
                  granularity = g
                  drill = null
                }}>{g}</button
              >
            {/each}
          </div>
          <Button variant="outline" size="md" aria-label="Refresh" class="w-11 px-0" onclick={() => void refresh()}>
            <RefreshCw size={16} />
          </Button>
        </div>
      </header>

      {#if loadError}<ErrorText>{loadError}</ErrorText>{/if}
      {#if !activity && !loadError}<p class="text-label text-text-muted" role="status">Loading…</p>{/if}

      {#if activity}
        {@const a = activity}
        {@const signups = trend(a.newUsers.last7d, a.newUsers.previous7d)}
        {@const today = new Date(a.generatedAt)}
        {@const signupBuckets = bucketize(
          a.newUsersPerDay.map(n => ({ signups: n })),
          today,
          granularity,
        )}
        {@const gameBuckets = bucketize(a.gamesPerDay.perDay, today, granularity)}
        {@const gameSeries = a.gamesPerDay.modes.map((m): Series => ({
          key: m,
          label: gameTitle(m),
          fill: modeFill(a.gamesPerDay.modes, m),
          swatch: modeColor(a.gamesPerDay.modes, m),
        }))}
        {@const signupSeries = [{ key: 'signups', label: 'New users', fill: 'fill-accent', swatch: 'bg-accent' }]}
        {@const slot = busiestSlot(a.busiest)}
        <p class="text-small text-text-muted">Updated {clock(a.generatedAt)} · refreshes every 20 seconds</p>

        <section class="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4" aria-label="Right now">
          {@render stat('Online now', formatCount(a.live.online), `${formatCount(a.live.runningGames)} live matches`)}
          {@render stat(
            'New users · 7 d',
            formatCount(a.newUsers.last7d),
            signups ? `${signups.label} vs the week before` : undefined,
            signups?.up,
          )}
          {@render stat('Players · 24 h', formatCount(a.last24h.players))}
          {@render stat('Games · 24 h', formatCount(a.last24h.games))}
          {@render stat('180s · 24 h', formatCount(a.last24h.oneEighties))}
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
          <section class="card p-4 md:p-5 flex flex-col gap-4 lg:col-span-2" aria-labelledby="act-users">
            {@render panel(
              'act-users',
              `New users per ${granularity}`,
              `last ${a.days} days · ${formatCount(a.newUsersPerDay.reduce((x, y) => x + y, 0))} total`,
            )}
            <ActivityBars
              buckets={signupBuckets}
              series={signupSeries}
              {granularity}
              yTitle="New users"
              unit="new users"
              label="New users per {granularity}, {a.days} days"
              onpick={(b: Bucket) => pickBucket('signups', b)}
            />
            {#if drill?.chart === 'signups'}
              <ActivityDrill title={drill.title} query={drill.query} onclose={() => (drill = null)} />
            {/if}
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-3" aria-labelledby="act-now">
            <div class="flex items-center justify-between">
              {@render panel('act-now', 'Happening now', null)}
              <span class="text-caption font-bold text-live-text">LIVE</span>
            </div>
            <ul class="flex flex-col">
              {#each a.happeningNow.tournaments as t (t.id)}
                <li class="flex items-baseline justify-between gap-3 py-2 border-b border-line">
                  <a href="#/tournaments/{t.id}" class="min-w-0 truncate text-label">{t.name}</a>
                  <span class="shrink-0 text-small text-text-muted"
                    >{t.official ? 'Official' : 'Community'} · {t.status === 'running' ? 'running' : 'check-in'} · {t.entries}</span
                  >
                </li>
              {/each}
              <li class="flex items-baseline justify-between py-2 border-b border-line">
                <span class="text-label">Ranked queue</span><span class="text-label font-semibold"
                  >{formatCount(a.happeningNow.rankedQueue)}</span
                >
              </li>
              <li class="flex items-baseline justify-between py-2 border-b border-line">
                <span class="text-label">Open lobbies</span><span class="text-label font-semibold"
                  >{formatCount(a.happeningNow.openLobbies)}</span
                >
              </li>
              {#each Object.entries(a.happeningNow.runningGames) as [mode, n] (mode)}
                <li class="flex items-baseline justify-between py-2 border-b border-line last:border-b-0">
                  <span class="text-label">Running {gameTitle(mode)}</span><span class="text-label font-semibold">{formatCount(n)}</span>
                </li>
              {/each}
            </ul>
          </section>
        </div>

        <section class="card p-4 md:p-5 flex flex-col gap-4" aria-labelledby="act-games">
          <div class="flex flex-wrap items-start justify-between gap-3">
            {@render panel(
              'act-games',
              `Games played per ${granularity}`,
              `by mode · ${formatCount(gameBuckets.reduce((s, b) => s + b.total, 0))} in ${a.days} days`,
            )}
          </div>
          {#if a.gamesPerDay.modes.length === 0}
            <p class="text-label text-text-muted">No finished games in this range yet.</p>
          {:else}
            <ActivityBars
              buckets={gameBuckets}
              series={gameSeries}
              {granularity}
              yTitle="Games played"
              unit="games"
              label="Games per {granularity} by mode, {a.days} days"
              onpick={(b: Bucket) => pickBucket('games', b)}
            />
            {#if drill?.chart === 'games'}
              <ActivityDrill title={drill.title} query={drill.query} onclose={() => (drill = null)} />
            {/if}
          {/if}
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
          <section class="card p-4 md:p-5 flex flex-col gap-4 lg:col-span-2" aria-labelledby="act-when">
            {@render panel('act-when', 'When people play', `finished games · last 4 weeks · UTC${slot ? ` · busiest ${slot}` : ''}`)}
            <ActivityHeatmap grid={a.busiest} onpick={pickCell} />
            {#if drill?.chart === 'heat'}
              <ActivityDrill title={drill.title} query={drill.query} onclose={() => (drill = null)} />
            {/if}
          </section>

          <div class="flex flex-col gap-4 md:gap-5">
            <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="act-health">
              {@render panel('act-health', 'Platform health', 'right now')}
              <dl class="flex flex-col">
                <div class="flex justify-between py-2 border-b border-line">
                  <dt class="text-label text-text-muted">Bridges connected</dt>
                  <dd class="text-label font-semibold">{a.health.bridges}</dd>
                </div>
                <div class="flex justify-between py-2 border-b border-line">
                  <dt class="text-label text-text-muted">Boards online</dt>
                  <dd class="text-label font-semibold">{a.health.boardsOnline}</dd>
                </div>
                <div class="flex justify-between py-2">
                  <dt class="text-label text-text-muted">Darts entered by hand · 24 h</dt>
                  <dd class="text-label font-semibold">{a.health.manualDartShare === null ? '–' : percent(a.health.manualDartShare)}</dd>
                </div>
              </dl>
            </section>
            <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="act-high">
              {@render panel('act-high', 'Highlights', null)}
              <dl class="flex flex-col">
                <div class="flex justify-between py-2 border-b border-line">
                  <dt class="text-label text-text-muted">Achievements unlocked · 24 h</dt>
                  <dd class="text-label font-semibold">{formatCount(a.highlights.achievementsUnlocked24h)}</dd>
                </div>
                <div class="flex justify-between py-2">
                  <dt class="text-label text-text-muted">Teams created · 7 d</dt>
                  <dd class="text-label font-semibold">{formatCount(a.highlights.teamsCreated7d)}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      {/if}
    </PageMain>
  {/if}
</Layout>
