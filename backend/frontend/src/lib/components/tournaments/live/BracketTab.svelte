<script lang="ts">
  // A running tournament's bracket (the live page, tournament mode): the group or round-robin
  // tables, then the knockout's sections as columns per round.
  import BracketColumns from './BracketColumns.svelte'
  import StandingsTable from './StandingsTable.svelte'
  import type { Tournament } from '$lib/api'
  import { championOf, groupMatches, sectionsOf, type LiveMessage } from '$lib/tournaments/live'

  let { m, t, mine = null }: { m: LiveMessage; t: Pick<Tournament, 'format' | 'teamSize' | 'settings'>; mine?: string | null } = $props()

  const sections = $derived(sectionsOf(m, t.format))
  const champion = $derived(championOf(m))
</script>

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
