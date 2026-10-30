<script lang="ts">
  // The Boards page's own pending invites: a friend shared a board with you, waiting for you to
  // accept or decline. Nothing renders when there are none — this is the only place it shows,
  // visible only by opening the page.
  import { Button } from '$lib/components/ui/button/index.js'
  import type { IncomingBoardShare } from '$lib/boardShares'

  let {
    invites,
    onaccept,
    ondecline,
  }: { invites: IncomingBoardShare[]; onaccept: (id: string) => void; ondecline: (id: string) => void } = $props()
</script>

{#if invites.length > 0}
  <section aria-label="Pending board invites" class="flex flex-col gap-2">
    <h2 class="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-text-dim">Pending invites</h2>
    <ul class="m-0 p-0 list-none flex flex-col gap-2">
      {#each invites as inv (inv.id)}
        <li class="flex items-center gap-3 p-3 rounded-[12px] bg-surface-2 border border-line-2">
          <span class="flex-grow min-w-0 text-[14px] truncate">
            <strong class="font-semibold">{inv.boardName}</strong> from {inv.ownerName}
          </span>
          <Button variant="outline" size="sm" onclick={() => ondecline(inv.id)}>Decline</Button>
          <Button variant="accent" size="sm" onclick={() => onaccept(inv.id)}>Accept</Button>
        </li>
      {/each}
    </ul>
  </section>
{/if}
