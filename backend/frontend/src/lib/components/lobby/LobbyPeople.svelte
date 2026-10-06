<script lang="ts">
  // The lobby page's people list: boards to pick, each row's controls, and the add field
  // (a name adds a guest, @username sends an invite). Solo or not, players are added here.
  // The host drags people (or uses the ⋯ menu) to change the order.
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import AddBot from './AddBot.svelte'
  import AddSomeone from './AddSomeone.svelte'
  import BoardChip from './BoardChip.svelte'
  import PeopleList from './PeopleList.svelte'
  import PersonControls from './PersonControls.svelte'
  import { alreadyInOrInvited, boardChoices, canMove, type OwnBoard, type PersonPatch } from '$lib/lobby/rules'

  let {
    lobby,
    viewerId,
    ownBoards,
    onupdate,
    onremove,
    onguest,
    onbot,
    oninvite,
  }: {
    lobby: Lobby
    viewerId: string | null
    ownBoards: OwnBoard[]
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
    onremove: (personId: string) => Promise<boolean>
    onguest: (name: string) => Promise<boolean>
    onbot: (level: number) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()
</script>

<PeopleList {lobby} {viewerId} onplace={canMove(lobby, viewerId) ? onupdate : undefined}>
  {#snippet boardOf(p: LobbyPerson)}
    <BoardChip
      person={p}
      choices={boardChoices(p, viewerId, ownBoards)}
      onpick={(boardId: string | null) => void onupdate(p.id, { boardId })}
    />
  {/snippet}
  {#snippet controlsOf(p: LobbyPerson, i: number)}
    <PersonControls {lobby} person={p} index={i} {viewerId} {onupdate} {onremove} />
  {/snippet}
  {#snippet footer()}
    <div class="flex flex-col gap-2 md:flex-row md:items-start">
      <div class="flex-grow min-w-0">
        <AddSomeone exclude={alreadyInOrInvited(lobby)} {onguest} {oninvite} />
      </div>
      <AddBot {onbot} />
    </div>
  {/snippet}
</PeopleList>
