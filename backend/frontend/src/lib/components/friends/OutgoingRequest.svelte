<script lang="ts">
  // A request you sent: their picture, @handle, "Sent yesterday, 18:40", Cancel.
  import type { OutgoingFriendRequest } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import PersonBadges from '$lib/components/PersonBadges.svelte'
  import { outgoingMeta } from '$lib/friends/view'

  let { request, now, busy, oncancel }: { request: OutgoingFriendRequest; now: Date; busy: boolean; oncancel: () => void } = $props()
</script>

<div class="flex items-center gap-[10px] md:gap-3 min-h-11 md:min-h-[52px] pl-3 pr-1 md:pr-[6px] rounded-md bg-surface-row">
  <span class="hidden md:flex"><Avatar name={request.to.name} face={{ avatar: request.to.avatar, userId: request.to.id }} size={32} /></span
  >
  <span class="flex items-baseline md:items-start md:flex-col gap-[10px] md:gap-px min-w-0 grow">
    <span class="flex items-center gap-2 min-w-0">
      <span class="font-mono text-[13px] text-text truncate">{`@${request.to.name}`}</span>
      <PersonBadges country={request.to.country} average={request.to.average} />
    </span>
    <span class="text-[12px] text-text-dim truncate">{outgoingMeta(request, now)}</span>
  </span>
  <button
    type="button"
    disabled={busy}
    onclick={oncancel}
    class="shrink-0 h-9 px-[10px] md:px-3 border-0 rounded-sm text-text-muted text-[13px] cursor-pointer hover:text-text disabled:opacity-50"
    >Cancel</button
  >
</div>
