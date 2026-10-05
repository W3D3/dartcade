<script lang="ts">
  // The people in the lobby, in throwing order (in a team game, the teams take turns). The board and the right-hand side of each row
  // are the caller's (read-only labels by default; the lobby page passes its controls). With
  // `onplace` (the host's) each row gets a drag handle to move them in the order.
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { sortable, type SortableDrop } from '$lib/actions/sortable'
  import DragHandle from './DragHandle.svelte'
  import ReorderStatus from './ReorderStatus.svelte'
  import Panel from './Panel.svelte'
  import PersonRow from './PersonRow.svelte'
  import InvitedRow from './InvitedRow.svelte'
  import BoardLabel from './BoardLabel.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import { counts, nextGameInTeams, type PersonPatch } from '$lib/lobby/rules'
  import { listKeyMove, listPlacement, type Direction, type Placement } from '$lib/lobby/dnd'
  import { createReorder } from '$lib/lobby/reorder.svelte'
  import { gameModes } from '$lib/gameModes'

  let {
    lobby,
    viewerId,
    boardOf,
    controlsOf,
    onplace,
    footer,
  }: {
    lobby: Lobby
    viewerId: string | null
    /** What a row shows as the board (default: a read-only label). */
    boardOf?: Snippet<[LobbyPerson]>
    /** A row's right-hand side (default: a read-only status). */
    controlsOf?: Snippet<[LobbyPerson, number]>
    /** Moves someone in the order (the host); absent: no drag handles. */
    onplace?: (personId: string, patch: PersonPatch) => Promise<boolean>
    footer?: Snippet
  } = $props()
  const c = $derived(counts(lobby))
  // Singles throw in list order; in a team game the teams take turns
  const order = $derived(nextGameInTeams(lobby, $gameModes) ? 'teams take turns' : 'list order = throw order')

  const hintId = $props.id()
  const moves = createReorder(
    () => lobby.people,
    (personId, placement) => onplace?.(personId, placement) ?? Promise.resolve(false),
  )
  const place = (personId: string, placement: Placement) =>
    void moves.place(personId, placement, (people, p) => `${p.name} moved to place ${people.indexOf(p) + 1} of ${people.length}.`)
  const ondrop = ({ id, beforeId }: SortableDrop) => place(id, listPlacement(moves.people, id, beforeId))
  function onkey(id: string, dir: Direction) {
    const placement = listKeyMove(moves.people, id, dir)
    if (placement) place(id, placement)
  }
</script>

<Panel title="People · {c.people}" label="People in this lobby" flat>
  {#snippet note()}<ReadyCount {lobby} suffix={order} />{/snippet}
  {#if onplace}
    <ReorderStatus id={hintId} hint="Arrow up or down moves them one place." announcement={moves.announcement} />
  {/if}
  <ol
    class="m-0 p-0 list-none flex flex-col gap-[6px]"
    data-sortable-zone="people"
    use:sortable={{ ondrop, onkey, oncancel: () => moves.cancelled() }}
  >
    {#each moves.people as p, i (p.id)}
      {#snippet grip()}<DragHandle name={p.name} describedby={hintId} />{/snippet}
      <PersonRow person={p} index={i} {lobby} {viewerId} handle={onplace ? grip : undefined}>
        {#snippet board()}{#if boardOf}{@render boardOf(p)}{:else}<BoardLabel person={p} />{/if}{/snippet}
        {#snippet controls()}{#if controlsOf}{@render controlsOf(p, i)}{:else}<PersonStatus person={p} />{/if}{/snippet}
      </PersonRow>
    {/each}
    {#each lobby.invites as inv (inv.id)}
      <InvitedRow invitee={inv} />
    {/each}
  </ol>
  {#if footer}<div class="md:mt-auto">{@render footer()}</div>{/if}
</Panel>
