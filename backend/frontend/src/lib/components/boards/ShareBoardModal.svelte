<script lang="ts">
  // Share a board: pick an accepted friend who doesn't already have it. Reuses Friends.svelte's
  // own friend list (passed in) rather than fetching its own.
  import { Check } from '@lucide/svelte'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import type { Friend } from '$lib/api/lobby-ws'

  let {
    friends,
    alreadyShared,
    error = null,
    onshare,
    onclose,
  }: { friends: Friend[]; alreadyShared: string[]; error?: string | null; onshare: (friendUserId: string) => void; onclose: () => void } =
    $props()
</script>

<Modal title="Share this board" onclose={onclose} widthClass="max-w-[420px]">
  {#if error}<ErrorText class="text-[13px]">{error}</ErrorText>{/if}
  {#if friends.length === 0}
    <p class="m-0 text-[14px] text-text-muted">Add a friend first — only accepted friends can be invited.</p>
  {:else}
    <ul class="m-0 p-0 list-none flex flex-col gap-1 max-h-[320px] overflow-y-auto">
      {#each friends as f (f.id)}
        {@const shared = alreadyShared.includes(f.id)}
        <li>
          <button
            type="button"
            disabled={shared}
            onclick={() => onshare(f.id)}
            class="w-full flex items-center justify-between gap-3 p-3 rounded-[10px] text-left text-[14px] font-medium
                   bg-transparent border border-line-2 cursor-pointer transition-colors
                   hover:bg-surface-active disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {f.name}
            {#if shared}<Check size={16} class="text-accent" />{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Modal>
