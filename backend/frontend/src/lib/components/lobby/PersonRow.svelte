<script lang="ts">
  // One person in the lobby list: place in the order, avatar, name and tags (no Host tag while
  // the lobby is solo), where they play, and on the right whatever the list puts there.
  // The host's lists put a drag handle in front.
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import Avatar from '$lib/components/Avatar.svelte'
  import { personLine } from '$lib/lobby/format'

  let {
    person,
    index,
    lobby,
    viewerId,
    handle,
    board,
    controls,
  }: {
    person: LobbyPerson
    index: number
    lobby: Lobby
    viewerId: string | null
    /** The drag handle (the host's), before the place in the order. */
    handle?: Snippet
    board: Snippet
    controls: Snippet
  } = $props()
  const line = $derived(personLine(person, lobby.people, viewerId))
</script>

<li
  data-sortable-id={person.id}
  class="relative grid items-center gap-[10px] min-h-[56px] box-border py-[6px] pr-1 md:pr-2 rounded-[10px] bg-surface-row
         {handle ? 'grid-cols-[32px_14px_36px_minmax(0,1fr)_auto] pl-0' : 'grid-cols-[14px_36px_minmax(0,1fr)_auto] pl-[10px]'}"
>
  {#if handle}{@render handle()}{/if}
  <span class="font-mono text-[12px] text-text-dim text-center">{index + 1}</span>
  <Avatar name={person.name} bot={person.bot} guest={person.userId === null} presence={person.presence} />
  <span class="flex flex-col gap-1 min-w-0">
    <!-- The tags wrap under the name on a narrow row, so the name stays readable -->
    <span class="flex flex-wrap items-center gap-x-[6px] gap-y-1 min-w-0">
      <span class="max-w-full text-[15px] font-semibold truncate">{person.name}</span>
      {#if person.userId !== null && person.userId === viewerId}<span class="text-[12px] font-medium text-accent shrink-0">· you</span>{/if}
      {#if !lobby.solo && person.userId !== null && person.userId === lobby.hostUserId}<Badge variant="host">Host</Badge>{/if}
      {#if person.bot}<Badge variant="bot">Bot</Badge>{:else if person.userId === null}<Badge variant="guest">Guest</Badge>{/if}
    </span>
    <span class="flex items-center gap-[6px] min-w-0 text-[12px] text-text-muted">
      {@render board()}
      {#if line}<span class="truncate">{line}</span>{/if}
    </span>
  </span>
  <span class="flex items-center gap-[6px]">{@render controls()}</span>
</li>
