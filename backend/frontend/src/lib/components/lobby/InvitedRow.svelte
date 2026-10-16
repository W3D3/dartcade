<script lang="ts">
  // One pending invite, after the joined people (Lobby-Invite-Sent): their name with PENDING,
  // and the invite on its way. It turns into a PersonRow when they accept, and disappears when
  // they decline or the invite ends; both come from the server's snapshot, so this only
  // renders what it's given.
  import { LoaderCircle } from '@lucide/svelte'
  import type { LobbyInvitee } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import Avatar from '$lib/components/Avatar.svelte'

  let { invitee }: { invitee: LobbyInvitee } = $props()
</script>

<li
  class="grid grid-cols-[14px_36px_minmax(0,1fr)_auto] items-center gap-[10px] min-h-[56px] box-border py-[6px] pl-[10px] pr-1 md:pr-2 rounded-[10px] bg-surface-row"
>
  <span></span>
  <Avatar name={invitee.name} />
  <span class="flex items-center gap-2 min-w-0">
    <span class="text-[15px] font-semibold truncate">{invitee.name}</span>
    <Badge variant="invited">Pending</Badge>
  </span>
  <Badge variant="sits-out">
    <LoaderCircle size={11} strokeWidth={3} class="animate-spin motion-reduce:animate-none shrink-0" />
    Invite sent
  </Badge>
</li>
