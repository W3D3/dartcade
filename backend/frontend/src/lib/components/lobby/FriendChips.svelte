<script lang="ts">
  // "Friends: [+ Lena] [+ Max] All friends": add a friend to the lobby in one tap (an invite;
  // their row shows Pending until they accept). Hidden when there's nobody to add.
  import type { FriendChip } from '$lib/lobby/friendChips'

  let { chips, onpick }: { chips: FriendChip[]; onpick: (userId: string) => void } = $props()
</script>

{#if chips.length > 0}
  <div class="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
    <span>Friends:</span>
    {#each chips as c (c.id)}
      <button
        type="button"
        aria-label={c.aria}
        onclick={() => onpick(c.id)}
        class="h-8 px-3 flex items-center gap-[6px] rounded-full border border-line-chip bg-surface-chip text-text text-[13px] font-medium cursor-pointer font-[inherit]"
      >
        {#if c.online}<span class="w-2 h-2 rounded-full bg-accent" title="Online"></span>{/if}
        + {c.name}
      </button>
    {/each}
    <a href="#/friends" class="text-accent font-semibold no-underline">All friends</a>
  </div>
{/if}
