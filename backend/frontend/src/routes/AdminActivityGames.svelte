<!-- Games played (`#/admin/activity/games`): the Activity page's games chart with filters (users, country, seats,
     mode, kind, dates) and the matching games as a table. The filters live in the hash query, so a view can be shared. -->
<script lang="ts">
  import { push, querystring, replace } from 'svelte-spa-router'
  import { SvelteMap } from 'svelte/reactivity'
  import { Download, LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Flag from '$lib/components/Flag.svelte'
  import PickList from '$lib/components/admin/PickList.svelte'
  import UserCombobox from '$lib/components/admin/UserCombobox.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import GamesOverTime from '$lib/components/admin/GamesOverTime.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import { DateRangePicker } from '$lib/components/ui/date-picker/index.js'
  import { currentUser } from '$lib/auth'
  import { COUNTRY_OPTIONS, countryName } from '$lib/countries'
  import { createRequestGuard } from '$lib/requestGuard'
  import { formatWhen } from '$lib/history'
  import { hrefs } from '$lib/routes'
  import { activityGamesTrail } from '$lib/admin/breadcrumbs'
  import { formatCount } from '$lib/admin/activity'
  import type { AdminUser } from '$lib/admin/users'
  import {
    KINDS,
    NO_COUNTRY,
    PLAYER_BUCKETS,
    RANGES,
    STATUSES,
    csvHref,
    filtersToQuery,
    isFiltered,
    loadGames,
    outcomeText,
    pageCount,
    parseFilters,
    type AdminActivityGames,
    type Choice,
    type PlayerBucket,
    type Range,
    type GamesFilters,
  } from '$lib/admin/activityGames'
  import { GAME_NAMES, gameTitle } from '$shared/gameNames'

  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  // The URL is the one source of truth for the filters
  const filters = $derived(parseFilters($querystring))
  const query = $derived(filtersToQuery(filters))
  function set(next: Partial<GamesFilters>): void {
    // Any filter change goes back to the first page
    const q = filtersToQuery({ ...filters, page: 1, ...next })
    void replace(`/admin/activity/games${q ? `?${q}` : ''}`)
  }

  const requests = createRequestGuard()
  let data = $state<AdminActivityGames | null>(null)
  let loading = $state(true)
  let error = $state('')
  const now = Date.now()
  $effect(() => {
    const f = parseFilters(query)
    const token = requests.start()
    loading = true
    error = ''
    loadGames(f, now)
      .then(d => {
        if (requests.isCurrent(token)) data = d
      })
      .catch((e: unknown) => {
        if (requests.isCurrent(token)) error = e instanceof Error ? e.message : 'Could not load the games'
      })
      .finally(() => {
        if (requests.isCurrent(token)) loading = false
      })
  })

  // Names of the chosen users: the ones just picked, then whatever the server answered for a shared link
  const known = new SvelteMap<string, string>()
  $effect(() => {
    for (const u of data?.users ?? []) known.set(u.id, u.name)
  })
  const userName = (id: string): string => known.get(id) ?? id
  const countryLabel = (code: string): string => (code === NO_COUNTRY ? 'No country' : countryName(code))

  function addUser(u: AdminUser): void {
    known.set(u.id, u.name)
    if (!filters.users.some(p => p.id === u.id)) set({ users: [...filters.users, { id: u.id, side: 'in' }] })
  }
  const addCountry = (code: string): void => {
    if (code !== '' && !filters.countries.some(p => p.id === code)) set({ countries: [...filters.countries, { id: code, side: 'in' }] })
  }
  const toggleMode = (id: string): void =>
    set({ modes: filters.modes.includes(id) ? filters.modes.filter(m => m !== id) : [...filters.modes, id] })

  const pages = $derived(data ? pageCount(data.total, data.pageSize) : 1)
  const exportHref = $derived(csvHref(filters, now))
</script>

{#snippet label(text: string)}<span class="label-caps text-caption text-text-dim">{text}</span>{/snippet}

<Layout title="Games played">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          as="div"
          trail={activityGamesTrail()}
          title="Games played"
          sub="Filter the games by who played, where from, how many and what"
        />
        <div class="flex flex-col items-end gap-1">
          <Button variant="outline" size="md" href={exportHref} download="games.csv"><Download size={16} /> Export CSV</Button>
          {#if data && data.total > data.csvMax}
            <p class="text-small text-text-muted" role="status">
              The file holds the newest {formatCount(data.csvMax)} of {formatCount(data.total)} games. Narrow the filters to export the rest.
            </p>
          {/if}
        </div>
      </header>

      <section aria-label="Filters" class="card flex flex-col gap-4 p-4 md:p-5">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="flex flex-col gap-2">
            {@render label('Users')}
            <UserCombobox label="Search users by name or email" onpick={addUser} />
            <PickList picks={filters.users} onchange={(users: Choice[]) => set({ users })} name={userName} label="users" />
          </div>

          <div class="flex flex-col gap-2">
            {@render label('Country of the players')}
            <div class="flex flex-wrap items-center gap-2">
              <Select
                label="Add a country"
                value=""
                options={[{ value: '', label: 'Add a country…' }, { value: NO_COUNTRY, label: 'No country' }, ...COUNTRY_OPTIONS]}
                onchange={addCountry}
              />
              <Select
                label="Which players must match"
                value={filters.countryMatch}
                options={[
                  { value: 'any', label: 'Any player' },
                  { value: 'all', label: 'All players' },
                ]}
                onchange={v => set({ countryMatch: v === 'all' ? 'all' : 'any' })}
              />
            </div>
            <PickList
              picks={filters.countries}
              onchange={(countries: Choice[]) => set({ countries })}
              name={countryLabel}
              label="countries"
            />
            {#if filters.countries.length > 0}
              <p class="flex flex-wrap gap-2 text-caption text-text-dim">
                {#each filters.countries as c (c.id)}{#if c.id !== NO_COUNTRY}<Flag code={c.id} />{/if}{/each}
                Guests and bots have no country and are left out.
              </p>
            {/if}
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div class="flex flex-col gap-1.5">
            {@render label('Players in a match')}
            <SegmentedControl
              label="Players in a match"
              class="w-72"
              options={PLAYER_BUCKETS.map(b => ({ value: b.id, label: b.label }))}
              value={filters.players}
              onchange={(players: PlayerBucket) => set({ players })}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            {@render label('Kind')}
            <Select
              label="Kind of game"
              value={filters.kind}
              options={KINDS.map(k => ({ value: k.id, label: k.label }))}
              onchange={v => set({ kind: KINDS.find(k => k.id === v)?.id ?? 'any' })}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            {@render label('Outcome')}
            <Select
              label="Finished or aborted"
              value={filters.status}
              options={STATUSES.map(s => ({ value: s.id, label: s.label }))}
              onchange={v => set({ status: STATUSES.find(s => s.id === v)?.id ?? 'finished' })}
            />
          </div>
          <label class="flex h-11 items-center gap-2 text-label">
            <Checkbox checked={filters.invalidated} onCheckedChange={v => set({ invalidated: v === true })} />
            Include invalidated games
          </label>
        </div>

        <div class="flex flex-col gap-1.5">
          {@render label('Game mode')}
          <div class="flex flex-wrap gap-2" role="group" aria-label="Game mode">
            {#each Object.keys(GAME_NAMES) as id (id)}
              <Chip selected={filters.modes.includes(id)} onclick={() => toggleMode(id)}>{gameTitle(id)}</Chip>
            {/each}
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1.5">
            {@render label('Dates')}
            <SegmentedControl
              label="Date range"
              class="w-md max-w-full"
              options={RANGES.map(r => ({ value: r.id, label: r.label }))}
              value={filters.range}
              onchange={(range: Range) => set({ range })}
            />
          </div>
          {#if filters.range === 'custom'}
            <DateRangePicker
              label="Dates"
              from={filters.from}
              to={filters.to}
              onchange={(r: { from: string; to: string }) => set({ from: r.from, to: r.to })}
            />
          {/if}
          <Button variant="outline" size="md" disabled={!isFiltered(filters)} onclick={() => void replace('/admin/activity/games')}
            >Clear filters</Button
          >
        </div>
      </section>

      {#if error}<ErrorText>{error}</ErrorText>{/if}

      <section class="card flex flex-col gap-4 p-4 md:p-5" aria-labelledby="games-chart">
        <div class="flex flex-col gap-0.5">
          <h2 id="games-chart" class="text-body-lg font-semibold">
            {#if data}{formatCount(data.total)} {data.total === 1 ? 'game' : 'games'}{:else}Games{/if}
          </h2>
          <p class="text-small text-text-muted">matching the filters{isFiltered(filters) ? '' : ' (none set)'}</p>
        </div>
        {#if loading && !data}
          <p class="flex items-center gap-2 text-label text-text-muted" role="status">
            <LoaderCircle size={16} class="animate-spin" /> Loading…
          </p>
        {:else if data && data.perDay.length > 0}
          <GamesOverTime perDay={data.perDay} />
        {/if}
      </section>

      <section class="card flex flex-col overflow-hidden" aria-label="Matching games" aria-busy={loading}>
        {#if data && data.games.length === 0 && !loading}
          <p class="px-5 py-10 text-body text-text-muted">No games match these filters.</p>
        {:else if data}
          <ul>
            {#each data.games as g (g.id)}
              {@const when = formatWhen(g.createdAt, new Date(now))}
              {@const href = g.status === 'finished' ? hrefs.adminGames(g.id) : undefined}
              <li class="border-b border-line">
                <svelte:element
                  this={href ? 'a' : 'div'}
                  {href}
                  class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 {href ? 'hover:bg-surface-paused' : ''}"
                >
                  <span class="flex w-[110px] shrink-0 flex-col">
                    <span class="text-body font-semibold">{when.day}</span>
                    <span class="type-mono-sm text-text-dim">{when.time}</span>
                  </span>
                  <span class="w-[130px] shrink-0 type-cta font-bold tracking-title">{gameTitle(g.mode)}</span>
                  <span class="flex min-w-0 flex-1 basis-[220px] flex-wrap items-center gap-x-2 text-label text-ink-2">
                    {#each g.players as p, i (i)}
                      <span class="inline-flex items-center gap-1"
                        >{#if p.country}<Flag code={p.country} />{/if}{p.name}{p.bot ? ' (bot)' : ''}</span
                      >
                    {/each}
                  </span>
                  <span class="flex shrink-0 items-center gap-2 text-small text-text-muted">
                    {outcomeText(g)}
                    {#if g.ranked}<Badge variant="ready">ranked</Badge>{/if}
                    {#if g.invalidated}<Badge variant="guest">invalidated</Badge>{/if}
                  </span>
                </svelte:element>
              </li>
            {/each}
          </ul>
          <nav class="flex items-center justify-between gap-3 px-5 py-3" aria-label="Pages">
            <Button variant="outline" size="md" disabled={filters.page <= 1} onclick={() => set({ page: filters.page - 1 })}
              >Previous</Button
            >
            <span class="text-small text-text-muted">Page {data.page} of {pages}</span>
            <Button variant="outline" size="md" disabled={data.page >= pages} onclick={() => set({ page: filters.page + 1 })}>Next</Button>
          </nav>
        {/if}
      </section>
    </PageMain>
  {/if}
</Layout>
