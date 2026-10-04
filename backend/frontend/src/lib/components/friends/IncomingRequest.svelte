<script lang="ts">
  // A request for you: who, "3 friends in common · 10 min ago", Decline / Accept (phone: ✕ / Accept
  // on the same line).
  import { X } from '@lucide/svelte'
  import type { IncomingFriendRequest } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/lobby/Avatar.svelte'
  import { isPhone } from '$lib/viewport'
  import { Button } from '$lib/components/ui/button/index.js'
  import { incomingMeta } from '$lib/friends/view'

  let { request, now, busy, onaccept, ondecline }: { request: IncomingFriendRequest; now: Date; busy: boolean; onaccept: () => void; ondecline: () => void } = $props()
</script>

<div class="flex items-center md:items-stretch md:flex-col gap-[10px] p-[10px] pl-3 md:p-3 rounded-[12px] bg-surface-active border border-accent-line">
  <div class="flex items-center gap-[10px] md:gap-3 min-w-0 flex-grow">
    <Avatar name={request.from.name} size={$isPhone ? 38 : 40} />
    <span class="flex flex-col gap-px md:gap-[2px] min-w-0">
      <span class="text-[14px] md:text-[15px] font-semibold truncate">{request.from.name} <span class="font-mono text-[11px] md:text-[12px] font-normal text-text-dim">{`@${request.from.name}`}</span></span>
      <span class="text-[11px] md:text-[13px] text-text-muted truncate">{incomingMeta(request, now)}</span>
    </span>
  </div>
  <div class="shrink-0 flex gap-2 items-center md:grid md:grid-cols-2">
    <Button variant="outline" disabled={busy} onclick={ondecline} aria-label="Decline {request.from.name}"
      class="h-10 w-10 md:w-auto px-0 md:px-4 rounded-[9px] border-line-strong text-[14px] font-semibold">
      <span class="md:hidden flex"><X size={18} /></span><span class="hidden md:inline">Decline</span>
    </Button>
    <Button variant="accent" disabled={busy} onclick={onaccept} class="h-10 px-3 rounded-[9px] text-[14px]">Accept</Button>
  </div>
</div>
