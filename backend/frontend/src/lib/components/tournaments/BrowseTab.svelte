<script lang="ts">
  // Browse (Tournaments, Tournaments-Phone): the filters, then Official and Community tournaments,
  // each opening its Details. With `code` (an invite link) that tournament's Details open first.
  import { Trophy } from '@lucide/svelte'
  import type { Snippet } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import { Chip } from '$lib/components/ui/chip'
  import SearchInput from '$lib/components/ui/input/search-input.svelte'
  import type { Tournament, TournamentSummary } from '$lib/api'
  import { me } from '$lib/lobby/sockets'
  import {
    CHIPS,
    CHIP_LABELS,
    loadBrowse,
    loadByCode,
    loadTournament,
    matches,
    register,
    withdraw,
    checkIn,
    startNow,
    type Chip as ChipId,
    type KindFilter,
    type Outcome,
  } from '$lib/tournaments/browse'
  import RegisterTeamDialog from './RegisterTeamDialog.svelte'
  import TournamentDetail from './TournamentDetail.svelte'
  import TournamentRow from './TournamentRow.svelte'

  // `aside`: the column beside the list on a wide screen (Your teams)
  let { code, aside }: { code?: string; aside?: Snippet } = $props()

  let list = $state<TournamentSummary[] | null>(null)
  let failed = $state(false)
  let kind = $state<KindFilter>('all')
  const chips = new SvelteSet<ChipId>()
  let query = $state('')
  let open = $state<Tournament | null>(null)
  // Register a team, over Details when opened from there
  let registering = $state<Tournament | null>(null)
  let busy = $state(false)
  let error = $state('')

  const shown = $derived((list ?? []).filter(t => matches(t, { kind, chips, query })))
  const SECTIONS = [
    { kind: 'official', title: 'Official', text: 'Run by Dartcade' },
    { kind: 'community', title: 'Community', text: 'Made by players · anyone can create one' },
  ] as const

  async function refresh() {
    const rows = await loadBrowse()
    failed = rows === null
    if (rows) list = rows
  }

  /** Register or Withdraw in Details: the answer shows there, and in the list's row. */
  async function act(call: () => Promise<Outcome>) {
    busy = true
    try {
      const res = await call()
      if ('error' in res) error = res.error
      else [open, error] = [res.tournament, '']
      void refresh()
    } finally {
      busy = false
    }
  }

  async function show(id: string) {
    error = ''
    const res = await loadTournament(id)
    if ('error' in res) error = res.error
    else open = res.tournament
  }

  /** Register from a row: the row turns Registered, or Details open to say why not. */
  async function registerFromRow(id: string) {
    busy = true
    try {
      const res = await register(id)
      if ('error' in res) {
        await show(id)
        error = res.error
      }
      void refresh()
    } finally {
      busy = false
    }
  }

  /** Register team from a row: the dialog needs the whole tournament. */
  async function registerTeamFromRow(id: string) {
    const res = await loadTournament(id)
    if ('error' in res) error = res.error
    else registering = res.tournament
  }

  const toggle = (c: ChipId) => {
    if (!chips.delete(c)) chips.add(c)
  }
  const KINDS: KindFilter[] = ['all', 'official', 'community']

  // On open, and whenever the teams you were picked for change (you answered, or a captain picked you)
  let seenRequests: string | undefined
  $effect(() => {
    const ids = ($me?.tournamentRequests ?? []).map(r => r.tournamentId).join()
    if (ids === seenRequests) return
    seenRequests = ids
    void refresh()
  })
  $effect(() => {
    if (!code) return
    void loadByCode(code).then(res => ('error' in res ? (error = res.error) : (open = res.tournament)))
  })
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
    <SegmentedControl
      label="Kind"
      value={kind}
      onchange={id => (kind = KINDS.find(k => k === id) ?? 'all')}
      items={[
        { id: 'all', label: 'All' },
        { id: 'official', label: 'Official' },
        { id: 'community', label: 'Community' },
      ]}
    />
    <span class="hidden h-[26px] w-px bg-line md:block" aria-hidden="true"></span>
    <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filters">
      {#each CHIPS as c (c)}
        <Chip variant="plain" selected={chips.has(c)} onclick={() => toggle(c)}>{CHIP_LABELS[c]}</Chip>
      {/each}
    </div>
    <SearchInput bind:value={query} label="Search tournaments" class="h-[38px] md:ml-auto md:w-[190px]" />
  </div>

  {#if error && !open}<ErrorText>{error}</ErrorText>{/if}

  <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div class="flex min-w-0 flex-col gap-4">
      {#if list === null && !failed}
        <PageLoading />
      {:else if failed && list === null}
        <ErrorText>Couldn't load tournaments. Try again in a moment.</ErrorText>
      {:else if shown.length === 0}
        <EmptyState
          title={list?.length ? 'No tournaments match' : 'No tournaments yet'}
          text={list?.length
            ? 'Try fewer filters or another search.'
            : 'Open tournaments show up here: official events from Dartcade and tournaments run by players.'}
        >
          {#snippet icon()}<Trophy size={24} />{/snippet}
        </EmptyState>
      {:else}
        {#each SECTIONS as sec (sec.kind)}
          {@const rows = shown.filter(t => t.kind === sec.kind)}
          {#if rows.length > 0}
            <section
              aria-label={sec.title}
              class="flex flex-col gap-2.5 md:gap-0 md:rounded-card md:border md:border-line md:bg-surface-panel md:px-1.5 md:pt-4 md:pb-1.5"
            >
              <div class="flex items-baseline gap-3 md:px-4 md:pb-2">
                <h2 class="font-display text-player-name font-bold uppercase leading-none md:text-section-title">{sec.title}</h2>
                <span class="hidden text-small text-text-muted md:inline">{sec.text}</span>
              </div>
              <div
                class="hidden grid-cols-[72px_minmax(0,1.6fr)_minmax(0,1fr)_130px_136px] gap-4 px-4 pt-1 pb-2 text-caption font-bold uppercase tracking-[.12em] text-ink-faint md:grid"
                aria-hidden="true"
              >
                <span>When</span><span>Tournament</span><span>Entry · format</span><span>Players</span><span></span>
              </div>
              {#each rows as t (t.id)}
                <TournamentRow
                  {t}
                  {busy}
                  onopen={() => show(t.id)}
                  onregister={() => registerFromRow(t.id)}
                  onregisterteam={() => registerTeamFromRow(t.id)}
                />
              {/each}
            </section>
          {/if}
        {/each}
      {/if}
    </div>
    {#if aside}<div class="flex flex-col gap-4">{@render aside()}</div>{/if}
  </div>
</div>

{#if open}
  {@const t = open}
  <TournamentDetail
    {t}
    {code}
    {busy}
    {error}
    onclose={() => {
      open = null
      error = ''
    }}
    onregister={() => act(() => register(t.id, code))}
    onwithdraw={() => act(() => withdraw(t.id))}
    oncheckin={() => act(() => checkIn(t.id))}
    onstart={() => act(() => startNow(t.id))}
    onregisterteam={() => (registering = t)}
    onchanged={() => act(() => loadTournament(t.id))}
  />
{/if}

{#if registering}
  <RegisterTeamDialog
    t={registering}
    {code}
    onclose={() => (registering = null)}
    onregistered={(next: Tournament) => {
      registering = null
      if (open) open = next
      void refresh()
    }}
  />
{/if}
