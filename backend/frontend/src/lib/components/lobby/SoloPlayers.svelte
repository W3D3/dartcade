<script lang="ts">
  // The Play page's players while your lobby is solo: you and your guests with their boards,
  // the add field (a name adds a guest, @username sends an invite) and the throw order.
  // Reordering and the rest stay on the lobby page (Manage).
  import { X } from '@lucide/svelte'
  import type { Lobby, LobbyPerson, ThrowOrder } from '$lib/api/lobby-ws'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import IconButton from '$lib/components/IconButton.svelte'
  import AddSomeone from './AddSomeone.svelte'
  import BoardChip from './BoardChip.svelte'
  import PeopleList from './PeopleList.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import ThrowOrderField from './ThrowOrderField.svelte'
  import { lobbyActions, type ActionResult, type LobbyActions } from '$lib/lobby/actions'
  import { describeConflict } from '$lib/lobby/input'
  import { alreadyInOrInvited, boardChoices, canRemove, isHost, type OwnBoard } from '$lib/lobby/rules'

  let { lobby, viewerId, ownBoards, gameId }: {
    lobby: Lobby
    viewerId: string | null
    ownBoards: OwnBoard[]
    /** The game picked on the Play page (bull off is offered only for a game that has one). */
    gameId: string | null
  } = $props()

  let error = $state('')
  const host = $derived(isHost(lobby, viewerId))

  /** Runs a change on this lobby; a refusal shows under the list. Resolves true when it went through. */
  async function act(run: (a: LobbyActions) => Promise<ActionResult>): Promise<boolean> {
    const { error: refusal } = await run(lobbyActions(lobby.id))
    error = refusal ? describeConflict(refusal) : ''
    return !refusal
  }
</script>

<div class="pt-[18px] border-t border-line">
  <PeopleList {lobby} {viewerId} title="Players" bare>
    {#snippet note()}<a href="#/lobby" class="font-semibold text-accent no-underline">Manage</a>{/snippet}
    {#snippet boardOf(p: LobbyPerson)}
      <BoardChip person={p} choices={boardChoices(p, viewerId, ownBoards)} onpick={(boardId: string | null) => void act(a => a.updatePerson(p.id, { boardId }))} />
    {/snippet}
    {#snippet controlsOf(p: LobbyPerson)}
      {#if !p.plays}<PersonStatus person={p} />{/if}
      {#if canRemove(lobby, p, viewerId)}
        <IconButton tone="outline" label="Remove {p.name}" onclick={() => void act(a => a.removePerson(p.id))}><X size={16} /></IconButton>
      {/if}
    {/snippet}
    {#snippet footer()}
      <div class="flex flex-col gap-3">
        <AddSomeone exclude={alreadyInOrInvited(lobby)} onguest={(name: string) => act(a => a.addGuest(name))} oninvite={(userId: string) => act(a => a.invite(userId))} />
        {#if host}
          <ThrowOrderField {lobby} {gameId} onchange={(throwOrder: ThrowOrder) => void act(a => a.updateLobby({ throwOrder }))} />
        {/if}
        {#if error}<ErrorText class="text-[13px]">{error}</ErrorText>{/if}
      </div>
    {/snippet}
  </PeopleList>
</div>
