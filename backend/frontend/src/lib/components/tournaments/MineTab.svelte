<script lang="ts">
  // My tournaments (Tournaments-Mine, Tournaments-Mine-Phone): the match being played, filters, then
  // Upcoming, Organizing and Past, with This season and Your teams beside them. A row opens that
  // tournament's Details; an in-person tournament you organize opens its organizer page.
  import { Trophy } from '@lucide/svelte'
  import type { Snippet } from 'svelte'
  import type { MyTournaments } from '$lib/api'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Chip } from '$lib/components/ui/chip'
  import { hrefs } from '$lib/routes'
  import { dayLabel, gamePill, whenParts } from '$lib/tournaments/browse'
  import {
    MINE_FILTERS,
    MINE_FILTER_LABELS,
    asLine,
    averageText,
    filterMine,
    organizingLine,
    playedAs,
    statusLine,
    type MineFilter,
  } from '$lib/tournaments/mine'
  import { placeLabel } from '$shared/tournaments/mine'
  import { ordinal, plural } from '$lib/fmt'
  import TournamentDetailHost from './TournamentDetailHost.svelte'

  let { mine, onchange, aside }: { mine: MyTournaments; onchange: () => void; aside?: Snippet } = $props()

  let filter = $state<MineFilter>('all')
  let open = $state<string | null>(null)
  let allPast = $state(false)
  let error = $state('')
  function fail(message: string) {
    open = null
    error = message
  }

  const shown = $derived(filterMine(mine, filter))
  const past = $derived(allPast ? shown.past : shown.past.slice(0, 5))
  const owned = $derived(shown.organizing.filter(o => o.role === 'owner').length)
  const empty = $derived(!shown.live && shown.upcoming.length + shown.organizing.length + shown.past.length === 0)
  const TONE = { plain: 'text-text-muted', good: 'text-accent', warn: 'text-warn' } as const
</script>

<div class="flex flex-col gap-4">
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#if shown.live}
    {@const m = shown.live}
    <section
      aria-label="Your match"
      class="flex flex-wrap items-center gap-4 rounded-card border border-accent-line bg-accent-tint p-4 md:px-5"
    >
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="flex items-center gap-2 text-caption font-extrabold tracking-[.12em] text-live"
          ><span class="size-[7px] rounded-full bg-live"></span>YOUR MATCH</span
        >
        <span class="truncate text-small text-text-muted"
          >{m.tournament.name}{m.tournament.kind === 'community' ? ` · by ${m.tournament.owner?.name ?? 'a former player'}` : ''}</span
        >
        <span class="text-body-lg font-semibold">{m.round} vs {m.opponent}</span>
        <span class="text-small text-text-muted">First to {m.firstTo}</span>
      </span>
      <Button variant="accent" href={hrefs.session(m.sessionId)} class="w-full md:w-auto">Back to the match</Button>
    </section>
  {/if}

  <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filters">
    {#each MINE_FILTERS as f (f)}
      <Chip variant="plain" selected={filter === f} onclick={() => (filter = f)}>{MINE_FILTER_LABELS[f]}</Chip>
    {/each}
  </div>

  <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div class="flex min-w-0 flex-col gap-6">
      {#if empty}
        <EmptyState
          title={mine.playing.length + mine.organizing.length + mine.past.length === 0 ? 'Nothing here yet' : 'No tournaments match'}
          text={mine.playing.length + mine.organizing.length + mine.past.length === 0
            ? 'Tournaments you register for or organize show up here, with your next match first.'
            : 'Try another filter.'}
        >
          {#snippet icon()}<Trophy size={24} />{/snippet}
        </EmptyState>
      {/if}

      {#if shown.upcoming.length > 0}
        <section aria-label="Upcoming" class="flex flex-col gap-2.5">
          <div class="flex items-baseline gap-3">
            <h2 class="font-display text-player-name font-bold uppercase leading-none md:text-section-title">Upcoming</h2>
            <span class="text-small text-text-muted">{plural(shown.upcoming.length, 'tournament')}</span>
          </div>
          {#each shown.upcoming as p (p.tournament.id)}
            {@const t = p.tournament}
            {@const when = whenParts(t.startsAt)}
            {@const status = statusLine(p)}
            <button
              type="button"
              onclick={() => (open = t.id)}
              class="flex w-full cursor-pointer items-center gap-3 rounded-card border border-line bg-surface-panel p-3 text-left md:gap-4 md:p-4"
            >
              <span
                class="box-border flex size-[58px] flex-none flex-col items-center justify-center rounded-xl border border-line-2 bg-surface-row leading-none md:size-[72px]"
              >
                {#if when}
                  <span class="text-caption font-bold tracking-[.12em] text-ink-faint">{when.weekday}</span>
                  <span class="font-display text-player-name font-bold">{when.day}</span>
                  <span class="text-caption text-ink-2">{when.time}</span>
                {:else}
                  <span class="px-1 text-center text-caption font-bold tracking-cta text-ink-faint">TBA</span>
                {/if}
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="truncate text-body-lg font-semibold">{t.name}</span>
                  {#if t.kind === 'official'}{@render tag('OFFICIAL')}{/if}
                  {#if t.access === 'in_person'}{@render tag('IN PERSON')}{/if}
                  {#if t.teamSize > 1}{@render tag(`TEAMS OF ${t.teamSize}`)}{/if}
                </span>
                <span class="truncate text-small text-text-muted"
                  >{asLine(p)} · {gamePill(t.gameId, t.gameConfig)}{t.kind === 'community' && t.owner ? ` · by ${t.owner.name}` : ''}</span
                >
                <span class="text-small font-semibold {TONE[status.tone]}">{status.text}</span>
              </span>
            </button>
          {/each}
        </section>
      {/if}

      {#if shown.organizing.length > 0}
        <section aria-label="Organizing" class="flex flex-col gap-2.5">
          <div class="flex items-baseline gap-3">
            <h2 class="font-display text-player-name font-bold uppercase leading-none md:text-section-title">Organizing</h2>
            <span class="text-small text-text-muted"
              >you own {owned}{shown.organizing.length > owned ? ` · organizer in ${shown.organizing.length - owned}` : ''}</span
            >
          </div>
          {#each shown.organizing as o (o.tournament.id)}
            {@const t = o.tournament}
            <div class="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-panel p-3 md:gap-4 md:p-4">
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="flex flex-wrap items-center gap-2">
                  {@render tag(o.role === 'owner' ? 'OWNER' : 'ORGANIZER')}
                  {#if t.access === 'in_person'}{@render tag('IN PERSON')}{:else if t.access === 'invite'}{@render tag('INVITE LINK')}{/if}
                  {#if t.teamSize > 1}{@render tag(`TEAMS OF ${t.teamSize}`)}{/if}
                  {#if t.status === 'draft'}{@render tag('DRAFT')}{/if}
                </span>
                {#if t.access === 'in_person'}
                  <a href={hrefs.tournamentManage(t.id)} class="truncate text-body-lg font-semibold text-text no-underline hover:underline"
                    >{t.name}</a
                  >
                {:else}
                  <button
                    type="button"
                    onclick={() => (open = t.id)}
                    class="cursor-pointer truncate text-left text-body-lg font-semibold hover:underline">{t.name}</button
                  >
                {/if}
                <span class="text-small text-text-muted">{organizingLine(o, t.startsAt && dayLabel(t.startsAt))}</span>
              </span>
              {#if t.access === 'in_person'}
                <Button variant="outline" size="sm" href={hrefs.tournamentManage(t.id)}>Manage</Button>
              {:else if t.status === 'draft'}
                <Button variant="outline" size="sm" href={hrefs.tournamentEdit(t.id)}>Continue editing</Button>
              {:else}
                <Button variant="outline" size="sm" onclick={() => (open = t.id)}>Manage</Button>
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      {#if shown.past.length > 0}
        <section aria-label="Past" class="flex flex-col gap-2.5">
          <div class="flex items-baseline gap-3">
            <h2 class="font-display text-player-name font-bold uppercase leading-none md:text-section-title">Past</h2>
            <span class="text-small text-text-muted">{allPast ? 'all' : 'last 5'}</span>
            {#if shown.past.length > 5}
              <button
                type="button"
                onclick={() => (allPast = !allPast)}
                class="ml-auto cursor-pointer text-small font-semibold text-accent"
              >
                {allPast ? 'Last 5' : `All ${shown.past.length} ›`}
              </button>
            {/if}
          </div>
          <div class="overflow-hidden rounded-card border border-line bg-surface-panel">
            <div
              class="hidden grid-cols-[minmax(0,2fr)_80px_minmax(0,1.2fr)_70px_70px_60px] gap-3 px-4 py-2.5 text-caption font-bold uppercase tracking-[.12em] text-ink-faint md:grid"
              aria-hidden="true"
            >
              <span>Tournament</span><span>Date</span><span>Played as</span><span>Place</span><span>Matches</span><span>Avg</span>
            </div>
            {#each past as p (p.tournament.id)}
              {@const t = p.tournament}
              {@const place = p.place === null ? '–' : placeLabel(p.place, t.format)}
              <button
                type="button"
                onclick={() => (open = t.id)}
                class="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-surface-inset px-4 py-3 text-left hover:bg-surface-drop md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1.2fr)_70px_70px_60px]"
              >
                <span class="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
                  <span class="truncate">{t.name}</span>
                  {#if t.kind === 'official'}{@render tag('OFFICIAL')}{/if}
                  {#if t.access === 'in_person'}{@render tag('CLAIMED')}{/if}
                </span>
                <span class="text-small font-semibold md:order-last md:hidden">{place}</span>
                <span class="text-small text-text-muted md:text-body"
                  >{p.endedAt ? new Date(p.endedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}<span
                    class="md:hidden"
                  >
                    · {playedAs(p)}</span
                  ></span
                >
                <span class="hidden text-small text-ink-2 md:inline">{playedAs(p)}</span>
                <span class="hidden font-semibold md:inline">{place}</span>
                <span class="hidden text-small md:inline">{p.won}–{p.lost}</span>
                <span class="hidden text-small md:inline">{averageText(p.average)}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <div class="flex flex-col gap-4">
      <section class="card flex flex-col gap-3 p-5" aria-labelledby="this-season">
        <div class="flex items-baseline justify-between">
          <h3 id="this-season" class="text-body-lg font-semibold">This season</h3>
          <span class="text-small text-text-muted">{mine.season.label}</span>
        </div>
        <dl class="grid grid-cols-2 gap-3 text-small">
          {#each [['Played', String(mine.season.played)], ['Titles', String(mine.season.titles)], ['Matches', `${mine.season.won}–${mine.season.lost}`], ['Tournament avg', averageText(mine.season.average)]] as [label, value] (label)}
            <div class="flex flex-col gap-0.5">
              <dt class="text-caption font-bold uppercase tracking-[.12em] text-ink-faint">{label}</dt>
              <dd class="font-display text-card-title font-bold">{value}</dd>
            </div>
          {/each}
        </dl>
        <div class="flex flex-col gap-0.5 border-t border-surface-paused pt-3 text-small">
          <span class="text-caption font-bold uppercase tracking-[.12em] text-ink-faint">Best finish</span>
          <span class="font-semibold">{mine.season.best ? `${ordinal(mine.season.best.place)} · ${mine.season.best.tournament}` : '–'}</span
          >
        </div>
      </section>
      {#if aside}{@render aside()}{/if}
    </div>
  </div>
</div>

{#if open}
  <TournamentDetailHost id={open} onclose={() => (open = null)} onfail={fail} {onchange} />
{/if}

{#snippet tag(text: string)}
  <span class="inline-flex h-[20px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold tracking-section text-ink-2"
    >{text}</span
  >
{/snippet}
