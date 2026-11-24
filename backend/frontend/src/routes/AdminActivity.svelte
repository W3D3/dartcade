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
  import { hrefs } from '$lib/routes'
  import { gameTitle } from '$shared/gameNames'
  import { activityTrail } from '$lib/admin/breadcrumbs'
  import {
    RANGES,
    barHeights,
    busiestSlot,
    dayBars,
    formatCount,
    heatLevel,
    loadActivity,
    modeColor,
    percent,
    trend,
    type AdminActivity,
    type Range,
  } from '$lib/admin/activity'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let days = $state<Range>(30)
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
    void refresh()
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
  const HEAT = ['bg-surface-inset', 'bg-accent/20', 'bg-accent/40', 'bg-accent/70', 'bg-accent']
  const dayLabel = (d: Date) => d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
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
        <div class="flex items-center gap-2">
          <div role="group" aria-label="Range" class="flex rounded-key border border-line-chip overflow-hidden">
            {#each RANGES as r (r)}
              <button
                type="button"
                class="h-11 px-4 text-label font-semibold {days === r ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}"
                aria-pressed={days === r}
                onclick={() => pick(r)}>{r} days</button
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
        {@const bars = dayBars(a.gamesPerDay.perDay, a.gamesPerDay.modes, new Date(a.generatedAt))}
        {@const signupHeights = barHeights(a.newUsersPerDay)}
        {@const peak = Math.max(0, ...a.busiest.flat())}
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
              'New users per day',
              `last ${a.days} days · ${formatCount(a.newUsersPerDay.reduce((x, y) => x + y, 0))} total`,
            )}
            <div class="flex items-end gap-0.5 h-40" role="img" aria-label="New users per day, {a.days} days">
              {#each signupHeights as h, i (i)}
                <div class="flex-1 h-full flex items-end" title="{a.newUsersPerDay[i]} new">
                  <div class="w-full rounded-t-xs bg-accent" style:height="{h}%"></div>
                </div>
              {/each}
            </div>
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
            <a href={hrefs.adminLive()} class="mt-3 inline-block text-label">Watch live games</a>
          </section>
        </div>

        <section class="card p-4 md:p-5 flex flex-col gap-4" aria-labelledby="act-games">
          <div class="flex flex-wrap items-start justify-between gap-3">
            {@render panel(
              'act-games',
              'Games played per day',
              `by mode · ${formatCount(bars.reduce((s, b) => s + b.total, 0))} in ${a.days} days`,
            )}
            <ul class="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
              {#each a.gamesPerDay.modes as m (m)}
                <li class="flex items-center gap-2">
                  <span class="size-3 rounded-xs {modeColor(a.gamesPerDay.modes, m)}"></span>{gameTitle(m)}
                </li>
              {/each}
            </ul>
          </div>
          {#if a.gamesPerDay.modes.length === 0}
            <p class="text-label text-text-muted">No finished games in this range yet.</p>
          {:else}
            <div class="flex items-end gap-0.5 h-48" role="img" aria-label="Games per day by mode, {a.days} days">
              {#each bars as b (b.day.getTime())}
                <div
                  class="flex-1 h-full flex flex-col-reverse justify-start"
                  title="{dayLabel(b.day)}: {b.total} games · {b.parts.map(p => `${gameTitle(p.mode)} ${p.count}`).join(', ')}"
                >
                  {#each b.parts as p (p.mode)}
                    <div class={modeColor(a.gamesPerDay.modes, p.mode)} style:height="{p.height}%"></div>
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-start">
          <section class="card p-4 md:p-5 flex flex-col gap-4 lg:col-span-2" aria-labelledby="act-when">
            {@render panel('act-when', 'When people play', `finished games · last 4 weeks · UTC${slot ? ` · busiest ${slot}` : ''}`)}
            <div class="overflow-x-auto">
              <div
                class="grid gap-0.5 min-w-120"
                style:grid-template-columns="auto repeat(24, minmax(0, 1fr))"
                role="img"
                aria-label="Games by weekday and hour"
              >
                {#each a.busiest as row, d (d)}
                  <span class="pr-2 text-caption text-text-muted">{WEEKDAYS[d]}</span>
                  {#each row as n, h (h)}
                    <span class="h-5 rounded-xs {HEAT[heatLevel(n, peak)]}" title="{WEEKDAYS[d]} {h}:00 · {n} games"></span>
                  {/each}
                {/each}
              </div>
            </div>
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
