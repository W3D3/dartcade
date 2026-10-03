<script lang="ts">
  // One person in the lobby list: place in the order, avatar, name and tags, where they play,
  // and on the right whatever the list puts there (status, or controls).
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import Avatar from './Avatar.svelte'
  import { personLine } from '$lib/lobby/format'

  let { person, index, lobby, viewerId, board, controls }: {
    person: LobbyPerson
    index: number
    lobby: Lobby
    viewerId: string | null
    board: Snippet
    controls: Snippet
  } = $props()
  const line = $derived(personLine(person, lobby.people, viewerId))
</script>

<li class="relative grid grid-cols-[14px_36px_minmax(0,1fr)_auto] items-center gap-[10px] min-h-[56px] box-border py-[6px] pl-[10px] pr-1 md:pr-2 rounded-[10px] bg-surface-row">
  <span class="font-mono text-[12px] text-text-dim text-center">{index + 1}</span>
  <Avatar name={person.name} guest={person.userId === null} presence={person.presence} />
  <span class="flex flex-col gap-1 min-w-0">
    <span class="flex items-center gap-[6px] min-w-0">
      <span class="text-[15px] font-semibold truncate">{person.name}</span>
      {#if person.userId !== null && person.userId === viewerId}<span class="text-[12px] font-medium text-accent shrink-0">· you</span>{/if}
      {#if person.userId !== null && person.userId === lobby.hostUserId}<Badge variant="host">Host</Badge>{/if}
      {#if person.userId === null}<Badge variant="guest">Guest</Badge>{/if}
    </span>
    <span class="flex items-center gap-[6px] min-w-0 text-[12px] text-text-muted">
      {@render board()}
      {#if line}<span class="truncate">{line}</span>{/if}
    </span>
  </span>
  <span class="flex items-center gap-[6px]">{@render controls()}</span>
</li>
