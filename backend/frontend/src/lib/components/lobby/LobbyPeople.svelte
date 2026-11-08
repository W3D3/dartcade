<script lang="ts">
  // The lobby page's people list: boards to pick, each row's controls, and the add field
  // (a name adds a guest, @username sends an invite). Solo or not, players are added here.
  // The host drags people (or uses the ⋯ menu) to change the order.
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import AddBot from './AddBot.svelte'
  import AddSomeone from './AddSomeone.svelte'
  import BoardChip from './BoardChip.svelte'
  import BoardLabel from './BoardLabel.svelte'
  import PeopleList from './PeopleList.svelte'
  import PersonControls from './PersonControls.svelte'
  import { gameModes } from '$lib/gameModes'
  import { alreadyInOrInvited, boardChoices, canMove, withLiveStatus, type OwnBoard, type PersonPatch } from '$lib/lobby/rules'

  let {
    lobby,
    viewerId,
    ownBoards,
    onupdate,
    onremove,
    onguest,
    onbot,
    oninvite,
    onboardsopen,
    locked = false,
  }: {
    lobby: Lobby
    viewerId: string | null
    ownBoards: OwnBoard[]
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
    onremove: (personId: string) => Promise<boolean>
    onguest: (name: string) => Promise<boolean>
    onbot: (level: number) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
    /** A board menu opened: reload your boards' status. */
    onboardsopen?: () => void
    /** The duo's ranked search runs: boards, ready and who is in cannot change. */
    locked?: boolean
  } = $props()

  // Whether the next game's module can seat a bot at all (it defines botTarget server-side —
  // see supportsBots in backend/src/games/index.ts); the server would refuse adding one
  // otherwise, so don't even offer it.
  const boards = $derived(withLiveStatus(ownBoards, lobby))
  const supportsBots = $derived($gameModes.find(g => g.id === lobby.nextGame?.gameId)?.supportsBots ?? false)
</script>

<PeopleList {lobby} {viewerId} {locked} onplace={!locked && canMove(lobby, viewerId) ? onupdate : undefined}>
  {#snippet boardOf(p: LobbyPerson)}
    {#if locked}
      <BoardLabel person={p} gameId={lobby.nextGame?.gameId} />
    {:else}
      <BoardChip
        person={p}
        choices={boardChoices(lobby, p, viewerId, boards)}
        gameId={lobby.nextGame?.gameId}
        onpick={(boardId: string | null) => void onupdate(p.id, { boardId })}
        onopen={onboardsopen}
      />
    {/if}
  {/snippet}
  {#snippet controlsOf(p: LobbyPerson, i: number)}
    <PersonControls {lobby} person={p} index={i} {viewerId} {onupdate} {onremove} {locked} />
  {/snippet}
  {#snippet footer()}
    {#if locked}
      <p class="text-[12px] leading-[1.45] text-text-dim">
        Going not-ready or leaving stops the search for both of you. Boards and who is in are locked until it ends.
      </p>
    {:else}
      <div class="flex flex-col gap-2 md:flex-row md:items-start">
        <div class="flex-grow min-w-0">
          <AddSomeone exclude={alreadyInOrInvited(lobby)} {onguest} {oninvite} />
        </div>
        {#if supportsBots}
          <AddBot gameId={lobby.nextGame?.gameId} {onbot} />
        {/if}
      </div>
    {/if}
  {/snippet}
</PeopleList>
