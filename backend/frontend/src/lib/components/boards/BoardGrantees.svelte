<script lang="ts">
  // The owner's "who has access" list for the selected board: friends invited or already using
  // it, each revocable, plus the button that opens ShareBoardModal.
  import { Share2 } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { BoardGrantee } from '$lib/boardShares'

  let { grantees, onrevoke, onshare }: { grantees: BoardGrantee[]; onrevoke: (shareId: string) => void; onshare: () => void } = $props()
</script>

<div class="flex flex-col gap-2 py-3 border-b border-line-2">
  <div class="flex items-center justify-between gap-3">
    <span class="text-text-muted text-[14px]">Shared with</span>
    <Button variant="outline" size="sm" onclick={onshare}>
      <Share2 size={14} />
      Share this board
    </Button>
  </div>
  {#if grantees.length > 0}
    <ul class="m-0 p-0 list-none flex flex-col gap-1">
      {#each grantees as g (g.id)}
        <li class="flex items-center justify-between gap-3 text-[13px]">
          <span class="truncate">{g.friendName} · {g.status === 'pending' ? 'Pending' : 'Accepted'}</span>
          <button
            type="button"
            onclick={() => onrevoke(g.id)}
            aria-label="Revoke {g.friendName}'s access"
            class="shrink-0 text-[12px] text-live-text underline decoration-line-3 underline-offset-4
                   transition-colors hover:decoration-live-text cursor-pointer bg-transparent border-0 font-[inherit]"
          >
            Revoke
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
