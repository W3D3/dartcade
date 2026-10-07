<script lang="ts">
  // The right-hand side of a person's row on the lobby page: "In" / "Sits out" and Ready for
  // your own rows (read-only status for others), and the ⋯ menu with what you may do.
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import RowMenu from './RowMenu.svelte'
  import ToggleChip from './ToggleChip.svelte'
  import { canMove, canRemove, canSetReady, isMine, type PersonPatch } from '$lib/lobby/rules'

  let {
    lobby,
    person,
    index,
    viewerId,
    onupdate,
    onremove,
  }: {
    lobby: Lobby
    person: LobbyPerson
    index: number
    viewerId: string | null
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
    onremove: (personId: string) => Promise<boolean>
  } = $props()

  // Your own rows only: the host sits others out with the who-plays chips on the next-game card
  const mine = $derived(isMine(person, viewerId))
  // A guest has no ready of their own: their row shows the badge, never the toggle (the
  // adder sets it on their own row instead)
  const readyControl = $derived(canSetReady(person, viewerId))
  // A solo lobby has no ready: every row is the viewer's or their guests'
  const showReady = $derived(!lobby.solo)
  const mover = $derived(canMove(lobby, viewerId))
  const last = $derived(lobby.people.length - 1)
  let removing = $state(false)
</script>

{#if mine}
  <ToggleChip
    on={person.plays}
    onclick={() => void onupdate(person.id, { plays: !person.plays })}
    label={person.plays ? `${person.name} plays the next game. Sit out` : `${person.name} sits out. Play the next game`}
  >
    {person.plays ? 'In' : 'Sits out'}
  </ToggleChip>
  {#if person.plays && showReady}
    {#if readyControl}
      <ToggleChip
        tone="solid"
        on={person.ready}
        onclick={() => void onupdate(person.id, { ready: !person.ready })}
        label={person.ready ? `${person.name} is ready. Mark as not ready` : `${person.name} is not ready. Mark as ready`}
      >
        {person.ready ? 'Ready' : 'Ready?'}
      </ToggleChip>
    {:else}
      <PersonStatus {person} />
    {/if}
  {/if}
{:else}
  <PersonStatus {person} {showReady} />
{/if}
<RowMenu
  name={person.name}
  onup={mover && index > 0 ? () => void onupdate(person.id, { position: index - 1 }) : undefined}
  ondown={mover && index < last ? () => void onupdate(person.id, { position: index + 1 }) : undefined}
  onremove={canRemove(lobby, person, viewerId)
    ? () => {
        removing = true
      }
    : undefined}
/>

{#if removing}
  <ConfirmModal
    title="Remove {person.name}?"
    body={person.userId !== null
      ? `${person.name} leaves the lobby, and their guests leave with them.`
      : `${person.name} leaves the lobby.`}
    confirmLabel="Remove"
    cancelLabel="Keep"
    danger
    onconfirm={() => {
      removing = false
      void onremove(person.id)
    }}
    oncancel={() => (removing = false)}
  />
{/if}
