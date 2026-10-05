<script lang="ts">
  // Who plays the next game: a chip per person; the host taps one to sit them out or back in.
  import type { Lobby } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import ToggleChip from './ToggleChip.svelte'
  import { boardSummary } from '$lib/lobby/rules'

  let { lobby, onplays }: { lobby: Lobby; onplays: (personId: string, plays: boolean) => void } = $props()
</script>

<div class="flex flex-col gap-2">
  <!-- Phones: the board summary goes on its own line under the label -->
  <span class="flex flex-col gap-[2px] md:flex-row md:justify-between md:gap-2">
    <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">Who plays · tap to sit someone out</span>
    <span class="text-[12px] md:text-[13px] text-text-muted md:text-right">{boardSummary(lobby)}</span>
  </span>
  <div class="flex flex-wrap gap-2">
    {#each lobby.people as p (p.id)}
      <ToggleChip size="md" on={p.plays} onclick={() => onplays(p.id, !p.plays)}>
        <Avatar name={p.name} guest={p.userId === null} size={28} />{p.name}
        {#if !p.plays}<span class="text-[12px]">· sits out</span>{/if}
      </ToggleChip>
    {/each}
  </div>
</div>
