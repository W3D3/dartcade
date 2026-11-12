<script lang="ts">
  // A group's (or a round robin's) table, best first, then its matches: those going through are
  // lit while the group is on.
  import Avatar from '$lib/components/Avatar.svelte'
  import MatchCard from './MatchCard.svelte'
  import { faceOf, type LiveEntry, type LiveMatch } from '$lib/tournaments/live'
  import type { TournamentLiveTable } from '$lib/api/tournament-ws.js'

  let {
    title,
    table,
    entries,
    mine,
    matches = [],
    through = 0,
  }: {
    title: string
    table: TournamentLiveTable
    entries: readonly LiveEntry[]
    mine: string | null
    matches?: readonly LiveMatch[]
    /** How many go on to the knockout. */
    through?: number
  } = $props()

  const entry = (id: string) => entries.find(e => e.id === id)
  const diff = (n: number) => (n > 0 ? `+${n}` : String(n))
</script>

<section class="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
  <h3 class="text-body-lg font-semibold">{title}</h3>
  <table class="w-full text-label">
    <thead class="text-caption text-text-muted">
      <tr>
        <th class="w-6 pb-1.5 text-left font-medium">#</th>
        <th class="pb-1.5 text-left font-medium">Player</th>
        <th class="w-8 pb-1.5 text-right font-medium" title="Played">P</th>
        <th class="w-8 pb-1.5 text-right font-medium" title="Won">W</th>
        <th class="w-8 pb-1.5 text-right font-medium" title="Lost">L</th>
        <th class="w-10 pb-1.5 text-right font-medium" title="Leg difference">±</th>
      </tr>
    </thead>
    <tbody>
      {#each table.rows as r, i (r.entryId)}
        {@const e = entry(r.entryId)}
        <tr
          class="border-t border-surface-paused {i < through ? 'text-text' : 'text-ink-2'} {r.entryId === mine ? 'bg-surface-picked' : ''}"
        >
          <td class="py-2 {i < through ? 'font-semibold text-accent' : 'text-text-muted'}">{i + 1}</td>
          <td class="py-2">
            <span class="flex min-w-0 items-center gap-2">
              <Avatar name={e?.name ?? '?'} face={faceOf(e)} size={22} />
              <span class="truncate font-medium">{e?.name ?? '—'}</span>
            </span>
          </td>
          <td class="py-2 text-right">{r.played}</td>
          <td class="py-2 text-right font-semibold">{r.won}</td>
          <td class="py-2 text-right">{r.lost}</td>
          <td class="py-2 text-right text-text-muted">{diff(r.legsWon - r.legsLost)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if matches.length > 0}
    <div class="flex flex-wrap gap-x-3 gap-y-5 pt-3">
      {#each matches as m (m.key)}<MatchCard match={m} {entries} {mine} />{/each}
    </div>
  {/if}
</section>
