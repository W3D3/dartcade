<script lang="ts">
  // The people in the lobby, in throwing order (in a team game, the teams take turns). The board and the right-hand side of each row
  // are the caller's (read-only labels by default; the lobby page passes its controls).
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import Panel from './Panel.svelte'
  import PersonRow from './PersonRow.svelte'
  import InvitedRow from './InvitedRow.svelte'
  import BoardLabel from './BoardLabel.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import { counts, nextGameInTeams } from '$lib/lobby/rules'
  import { gameModes } from '$lib/gameModes'

  let { lobby, viewerId, boardOf, controlsOf, footer }: {
    lobby: Lobby
    viewerId: string | null
    /** What a row shows as the board (default: a read-only label). */
    boardOf?: Snippet<[LobbyPerson]>
    /** A row's right-hand side (default: a read-only status). */
    controlsOf?: Snippet<[LobbyPerson, number]>
    footer?: Snippet
  } = $props()
  const c = $derived(counts(lobby))
  // Singles throw in list order; in a team game the teams take turns
  const order = $derived(nextGameInTeams(lobby, $gameModes) ? 'teams take turns' : 'list order = throw order')
</script>

<Panel title="People · {c.people}" label="People in this lobby" flat>
  {#snippet note()}<ReadyCount {lobby} suffix={order} />{/snippet}
  <ol class="m-0 p-0 list-none flex flex-col gap-[6px]">
    {#each lobby.people as p, i (p.id)}
      <PersonRow person={p} index={i} {lobby} {viewerId}>
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
