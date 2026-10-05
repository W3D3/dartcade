<script lang="ts">
  // Requests for you (Accept / Decline) and sent by you (Cancel). On the Requests tab with
  // "Requests for you · N" / "Sent by you · N" headings; in the right-hand card and on phones
  // without them (the card says the counts).
  import type { IncomingFriendRequest, OutgoingFriendRequest } from '$lib/api/lobby-ws'
  import IncomingRequest from './IncomingRequest.svelte'
  import OutgoingRequest from './OutgoingRequest.svelte'

  let {
    incoming,
    outgoing,
    now,
    emptyText,
    headings = true,
    busy,
    onanswer,
    oncancel,
  }: {
    incoming: IncomingFriendRequest[]
    outgoing: OutgoingFriendRequest[]
    now: Date
    /** "No open requests." on the tab, "No requests for you right now." in the card. */
    emptyText: string
    headings?: boolean
    busy: boolean
    onanswer: (id: string, answer: 'accept' | 'decline') => void
    oncancel: (id: string) => void
  } = $props()
  const H = 'm-0 text-[13px] font-semibold uppercase tracking-[0.1em] text-text-muted'
</script>

<div class="flex flex-col {headings ? 'gap-[10px]' : 'gap-[6px] md:gap-[10px]'}">
  {#if headings}<h3 class={H}>Requests for you · {incoming.length}</h3>{/if}
  {#each incoming as r (r.id)}
    <IncomingRequest request={r} {now} {busy} onaccept={() => onanswer(r.id, 'accept')} ondecline={() => onanswer(r.id, 'decline')} />
  {:else}
    <span class="text-[13px] md:text-[14px] text-text-dim">{emptyText}</span>
  {/each}
  {#if headings}<h3 class="{H} mt-[10px]">Sent by you · {outgoing.length}</h3>{/if}
  {#each outgoing as r (r.id)}
    <OutgoingRequest request={r} {now} {busy} oncancel={() => oncancel(r.id)} />
  {/each}
</div>
