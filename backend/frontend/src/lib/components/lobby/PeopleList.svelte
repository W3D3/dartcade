<script lang="ts">
  // The people in the lobby, in throwing order. The board and the right-hand side of each row
  // are the caller's (read-only labels by default; the lobby page passes its controls).
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import Panel from './Panel.svelte'
  import PersonRow from './PersonRow.svelte'
  import BoardLabel from './BoardLabel.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import { counts } from '$lib/lobby/rules'

  let { lobby, viewerId, title, note: headerNote, bare = false, boardOf, controlsOf, footer }: {
    lobby: Lobby
    viewerId: string | null
    /** The heading (default: "People · <how many>"). */
    title?: string
    /** Right of the heading (default: who's ready, and that the list is the throw order). */
    note?: Snippet
    /** No card of its own (inside another card). */
    bare?: boolean
    /** What a row shows as the board (default: a read-only label). */
    boardOf?: Snippet<[LobbyPerson]>
    /** A row's right-hand side (default: a read-only status). */
    controlsOf?: Snippet<[LobbyPerson, number]>
    footer?: Snippet
  } = $props()
  const c = $derived(counts(lobby))
</script>

<Panel title={title ?? `People · ${c.people}`} label="People in this lobby" flat {bare}>
  {#snippet note()}{#if headerNote}{@render headerNote()}{:else}<ReadyCount {lobby} suffix="list order = throw order" />{/if}{/snippet}
  <ol class="m-0 p-0 list-none flex flex-col gap-[6px]">
    {#each lobby.people as p, i (p.id)}
      <PersonRow person={p} index={i} {lobby} {viewerId}>
        {#snippet board()}{#if boardOf}{@render boardOf(p)}{:else}<BoardLabel person={p} />{/if}{/snippet}
        {#snippet controls()}{#if controlsOf}{@render controlsOf(p, i)}{:else}<PersonStatus person={p} />{/if}{/snippet}
      </PersonRow>
    {/each}
  </ol>
  {#if lobby.invites.length > 0}
    <p class="m-0 text-[13px] text-text-muted">Invited · waiting for {lobby.invites.map(i => i.name).join(', ')}</p>
  {/if}
  {#if footer}<div class="md:mt-auto">{@render footer()}</div>{/if}
</Panel>
