<script lang="ts">
  // A tournament's live page (Tournament-Live, #/tournaments/:id): who runs it, its game and format,
  // Bracket / Players / Rules, your match with Back to the match, Watch on the live matches you are
  // not in, and the schedule. The setup comes from the API, the running state from /ws/tournament.
  // `code`: an invite link's, for someone who holds no spot in it. Behind tournaments.enabled.
  import { onDestroy } from 'svelte'
  import { ChevronLeft, Trophy } from '@lucide/svelte'
  import { querystring } from 'svelte-spa-router'
  import Avatar from '$lib/components/Avatar.svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import BracketColumns from '$lib/components/tournaments/live/BracketColumns.svelte'
  import StandingsTable from '$lib/components/tournaments/live/StandingsTable.svelte'
  import YourMatchBanner from '$lib/components/tournaments/live/YourMatchBanner.svelte'
  import type { Tournament } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { ordinal } from '$lib/fmt'
  import { hrefs } from '$lib/routes'
  import { byLine, formatLong, gameLine, loadByCode, loadTournament } from '$lib/tournaments/browse'
  import {
    championOf,
    createLiveStore,
    faceOf,
    groupMatches,
    headline,
    myEntryId,
    recordOf,
    rulesOf,
    sectionsOf,
    stageWhen,
    yourMatch,
    type LiveEntry,
  } from '$lib/tournaments/live'

  let { params }: { params: { id: string } } = $props()

  type Tab = 'bracket' | 'players' | 'rules'
  const TABS: { id: Tab; label: string }[] = [
    { id: 'bracket', label: 'Bracket' },
    { id: 'players', label: 'Players' },
    { id: 'rules', label: 'Rules' },
  ]
  let tab = $state<Tab>('bracket')

  const enabled = flag('tournaments.enabled')
  // The route's tournament and code are fixed for the page's life
  const code = new URLSearchParams($querystring).get('code') ?? undefined
  // svelte-ignore state_referenced_locally
  const live = createLiveStore(params.id, code)
  const { message, gone } = live
  onDestroy(() => live.destroy())

  let t = $state<Tournament | null>(null)
  let missing = $state(false)
  // svelte-ignore state_referenced_locally
  void (code ? loadByCode(code) : loadTournament(params.id)).then(r => {
    // A code of another tournament must not show that one here
    if ('tournament' in r && r.tournament.id === params.id) t = r.tournament
    else missing = true
  })

  const m = $derived($message)
  const mine = $derived(m ? myEntryId(m, $currentUser?.id) : null)
  const yours = $derived(m && t ? yourMatch(m, t.format, $currentUser?.id) : null)
  const sections = $derived(m && t ? sectionsOf(m, t.format) : [])
  const champion = $derived(m ? championOf(m) : null)
  const head = $derived(m ? headline(m) : null)
  const rules = $derived(t ? rulesOf(t) : [])
  const players = $derived(
    m
      ? [...m.entries].sort(
          (a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || Number(a.status === 'withdrawn') - Number(b.status === 'withdrawn'),
        )
      : [],
  )
  function standing(e: LiveEntry): string {
    if (!m) return ''
    if (e.finalPlace !== null) return `${ordinal(e.finalPlace)} place`
    if (e.status === 'withdrawn') return 'Withdrawn'
    if (m.matches.length === 0) return e.status === 'checked_in' ? 'Checked in' : 'Registered'
    const r = recordOf(m, e.id)
    return `${r.won}–${r.lost}`
  }
</script>

{#snippet rulesList()}
  <ul class="flex flex-col gap-2 text-small/[1.45] text-ink-2">
    {#each rules as r (r)}<li>• {r}</li>{/each}
  </ul>
{/snippet}

<Layout title={t?.name ?? 'Tournament'}>
  <main class="flex min-h-0 min-w-0 grow flex-col gap-4 overflow-x-hidden overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <a href={hrefs.tournaments()} class="inline-flex items-center gap-1.5 text-label font-semibold text-text no-underline hover:text-accent"
      ><ChevronLeft size={16} aria-hidden="true" />Tournaments</a
    >
    {#if !$enabled || missing || $gone}
      <EmptyState title="Not found" text="This tournament doesn't exist, or it isn't open to you.">
        {#snippet icon()}<Trophy size={24} />{/snippet}
      </EmptyState>
    {:else if !t || !m || !head}
      <PageLoading />
    {:else}
      <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-5">
        <div class="flex min-w-0 flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex h-[22px] items-center rounded-pill px-2 type-pill text-caption font-bold
                     {head.live ? 'bg-live-soft text-live' : 'bg-surface-chip text-ink-2'}">{head.text}</span
            >
            <span class="flex items-center gap-1.5 text-small text-text-muted">
              {#if t.owner}<Avatar name={t.owner.name} face={null} size={18} />{/if}{byLine(t)}
            </span>
          </div>
          <h1 class="type-section-title font-bold leading-none md:text-page-title">{t.name}</h1>
          <span class="text-small text-text-muted md:text-body"
            >{gameLine(t.gameId, t.gameConfig, t.settings.firstTo)} · {formatLong(t)}</span
          >
        </div>
        <div class="w-full shrink-0 md:w-[300px]">
          <SegmentedControl
            label="Tournament"
            items={TABS}
            value={tab}
            fill
            onchange={id => (tab = TABS.find(x => x.id === id)?.id ?? 'bracket')}
          />
        </div>
      </header>

      {#if yours}<YourMatchBanner y={yours} you={m.entries.find(e => e.id === mine) ?? null} />{/if}

      <div class="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div class="flex min-w-0 flex-col gap-5">
          {#if tab === 'bracket'}
            {#if m.matches.length === 0}
              <section class="card p-6 text-body text-text-muted">
                {m.status === 'cancelled'
                  ? 'This tournament was cancelled.'
                  : `The bracket is drawn when the tournament starts, from the ${m.entries.filter(e => e.status !== 'withdrawn').length} ${t.teamSize === 1 ? 'players' : 'teams'} in it.`}
              </section>
            {/if}
            {#each m.tables as table (table.group)}
              <StandingsTable
                title={table.group === null ? 'Table' : `Group ${table.group}`}
                {table}
                entries={m.entries}
                {mine}
                matches={table.group === null ? [] : groupMatches(m, table.group)}
                through={t.settings.groups?.through ?? 0}
              />
            {/each}
            {#each sections as s, i (s.id)}
              <section class="card min-w-0 p-4 md:px-[26px] md:pt-6 md:pb-[30px]" aria-label={s.title}>
                {#if sections.length > 1 || m.tables.length > 0}<h3 class="mb-4 text-body-lg font-semibold">{s.title}</h3>{/if}
                <div class="-mx-4 overflow-x-auto px-4 pt-3 pb-1 md:mx-0 md:px-0" data-testid="bracket-scroll">
                  <BracketColumns
                    columns={s.columns}
                    entries={m.entries}
                    {mine}
                    {champion}
                    trophy={i === sections.length - 1 && t.format !== 'round_robin'}
                  />
                </div>
              </section>
            {/each}
          {:else if tab === 'players'}
            <section class="card flex flex-col p-2 md:p-3" aria-label="Players">
              {#each players as e (e.id)}
                <div
                  class="flex items-center gap-3 rounded-md px-2 py-2.5 {e.id === mine ? 'bg-surface-picked' : ''} {e.status === 'withdrawn'
                    ? 'text-text-dim'
                    : ''}"
                >
                  <span class="w-7 text-right type-mono-sm text-text-muted">{e.seed ?? ''}</span>
                  <Avatar name={e.name} face={faceOf(e)} size={28} />
                  <span class="min-w-0 grow truncate text-label font-medium">{e.name}{e.id === mine ? ' (you)' : ''}</span>
                  <span class="text-small text-text-muted">{standing(e)}</span>
                </div>
              {:else}
                <p class="p-3 text-body text-text-muted">Nobody has registered yet.</p>
              {/each}
            </section>
          {:else}
            <section class="card flex flex-col gap-3 p-5" aria-label="Rules">
              {#if t.description}<p class="text-label text-ink-2">{t.description}</p>{/if}
              {@render rulesList()}
            </section>
          {/if}
        </div>

        <aside class="flex min-w-0 flex-col gap-[18px]">
          {#if m.schedule.length > 0}
            <section class="card flex flex-col gap-2 p-5" aria-label="Schedule">
              <h3 class="text-body-lg font-semibold">Schedule</h3>
              {#each m.schedule as s (`${s.bracket}${s.round}`)}
                <div class="flex justify-between gap-2.5 border-t border-surface-paused py-2 text-label">
                  <span class={s.state === 'now' ? 'font-semibold text-text' : 'text-text-muted'}>{s.name}</span>
                  <span class="text-text-muted">{stageWhen(s)}</span>
                </div>
              {/each}
            </section>
          {/if}
          <section class="card hidden flex-col gap-3 p-5 lg:flex" aria-label="Rules summary">
            <h3 class="text-body-lg font-semibold">Rules</h3>
            {@render rulesList()}
          </section>
        </aside>
      </div>
    {/if}
  </main>
</Layout>
