<script lang="ts">
  // The next game's teams: Team A and Team B, each the people who play, in lobby order.
  // Who's in or sitting out stays on the lobby's people list — this panel only arranges who
  // plays into teams. The host (editable) taps a player's ⇄ to move them to the other team,
  // drags them by the grip (within a team, or into the other one at the drop spot), or
  // reshuffles everyone; a member only sees where they land.
  import { ArrowLeftRight, Shuffle } from '@lucide/svelte'
  import type { Lobby, LobbyPerson, TeamId } from '$lib/api/lobby-ws'
  import { sortable, type SortableDrop } from '$lib/actions/sortable'
  import { Button } from '$lib/components/ui/button/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import DragHandle from './DragHandle.svelte'
  import ReorderStatus from './ReorderStatus.svelte'
  import { teamRosters, teamsMessage, type PersonPatch } from '$lib/lobby/rules'
  import { teamKeyMove, teamPlacement, type Direction, type Placement } from '$lib/lobby/dnd'
  import { createReorder } from '$lib/lobby/reorder.svelte'

  let {
    lobby,
    editable,
    onmove,
    onplace,
    onshuffle,
  }: {
    lobby: Lobby
    editable: boolean
    onmove?: (personId: string, team: TeamId) => void
    /** Drag and arrow keys: a new team and/or place in the lobby order; absent: no grips. */
    onplace?: (personId: string, patch: PersonPatch) => Promise<boolean>
    onshuffle?: () => void
  } = $props()

  const other = (team: TeamId): TeamId => (team === 'A' ? 'B' : 'A')
  const draggable = $derived(editable && onplace !== undefined)
  const hintId = $props.id()
  const moves = createReorder(
    () => lobby.people,
    (personId, placement) => onplace?.(personId, placement) ?? Promise.resolve(false),
  )
  const rosters = $derived(teamRosters({ ...lobby, people: moves.people }))
  function place(personId: string, placement: Placement) {
    void moves.place(personId, placement, (people, p) => {
      const team = people.filter(q => q.plays && q.team === p.team)
      return `${p.name} moved to Team ${p.team ?? ''}, place ${team.indexOf(p) + 1} of ${team.length}.`
    })
  }
  function ondrop({ id, zone, beforeId }: SortableDrop) {
    const team = zone === 'A' || zone === 'B' ? zone : null
    if (team) place(id, teamPlacement(moves.people, id, team, beforeId))
  }
  function onkey(id: string, dir: Direction) {
    const placement = teamKeyMove(moves.people, id, dir)
    if (placement) place(id, placement)
  }
  const message = $derived(teamsMessage(rosters.a.length, rosters.b.length))
</script>

{#snippet column(team: TeamId, people: LobbyPerson[])}
  <div
    role="group"
    aria-label="Team {team}"
    data-sortable-zone={team}
    class="box-border p-3 rounded-[12px] bg-surface-row border border-line-2 flex flex-col gap-2 min-w-0"
  >
    <span
      class="inline-flex items-center self-start h-[26px] px-[10px] rounded-[7px] font-display font-bold
                 text-[16px] tracking-[0.06em] uppercase
                 {team === 'A' ? 'bg-accent text-accent-fg' : 'border-2 border-text text-text'}"
    >
      Team {team}
    </span>
    {#each people as p (p.id)}
      <div
        data-sortable-id={p.id}
        class="relative flex items-center {draggable ? 'gap-[6px]' : 'gap-[10px]'} min-h-12 pr-1 rounded-[9px] bg-surface-paused {draggable
          ? 'pl-0'
          : 'pl-2'}"
      >
        {#if draggable}<DragHandle name={p.name} describedby={hintId} />{/if}
        <Avatar name={p.name} bot={p.bot} guest={p.userId === null} size={30} />
        <span class="flex flex-col gap-px min-w-0 flex-grow">
          <span class="text-[14px] font-semibold truncate">{p.name}</span>
          <span class="text-[12px] text-text-muted truncate">{p.boardName ?? 'Manual entry'}</span>
        </span>
        {#if editable}
          <button
            type="button"
            aria-label="Move {p.name} to Team {other(team)}"
            title="Move to Team {other(team)}"
            class="w-8 h-10 shrink-0 flex items-center justify-center rounded-[8px] border-0 bg-transparent
                   text-text-muted cursor-pointer"
            onclick={() => onmove?.(p.id, other(team))}
          >
            <ArrowLeftRight size={18} strokeWidth={2} />
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col gap-2">
  <span class="flex items-center justify-between gap-2">
    <span class="field-label max-md:text-[13px]">Teams</span>
    {#if editable}
      <Button variant="outline" size="sm" onclick={() => onshuffle?.()}>
        <Shuffle size={15} strokeWidth={2.2} />Shuffle
      </Button>
    {/if}
  </span>
  {#if draggable}
    <ReorderStatus
      id={hintId}
      hint="Arrow up or down moves them within their team, left to Team A, right to Team B."
      announcement={moves.announcement}
    />
  {/if}
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-[10px]" use:sortable={{ ondrop, onkey, oncancel: () => moves.cancelled() }}>
    {@render column('A', rosters.a)}
    {@render column('B', rosters.b)}
  </div>
  {#if message}<span role="status" class="text-[13px] text-warn">{message}</span>{/if}
</div>
