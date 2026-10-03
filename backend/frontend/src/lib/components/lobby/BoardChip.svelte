<script lang="ts">
  // A person's board as a chip that opens what the board rule lets the viewer pick; a plain
  // label when there's nothing to pick.
  import { ChevronDown } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import type { BoardChoice } from '$lib/lobby/rules'
  import BoardLabel from './BoardLabel.svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverMenu from './PopoverMenu.svelte'

  let { person, choices, onpick }: {
    person: LobbyPerson
    choices: BoardChoice[]
    /** null: manual entry */
    onpick: (boardId: string | null) => void
  } = $props()
</script>

{#if choices.length === 0}
  <BoardLabel {person} />
{:else}
  <PopoverMenu label="Choose a board for {person.name}"
    triggerLabel="Board for {person.name}: {person.boardName ?? 'manual entry'}. Change board"
    triggerClass="max-w-full h-[30px] md:h-[34px] box-border inline-flex items-center gap-[6px] pl-[10px] pr-2 rounded-[8px] border bg-[#22251f] text-ink-soft text-[13px] font-semibold
                  {person.boardMovedBy !== null ? 'border-[#5c7323]' : 'border-line-chip'}">
    {#snippet trigger()}<BoardLabel {person} /><ChevronDown size={14} class="shrink-0" />{/snippet}
    {#snippet children(close: () => void)}
      {#each choices as c (c.boardId ?? 'manual')}
        <MenuItem label={c.label} detail={c.detail} checked={c.current} onclick={() => { close(); if (!c.current) onpick(c.boardId) }} />
      {/each}
      {#if person.usualBoardName}
        <span class="px-[10px] pt-[6px] pb-1 text-[12px] text-text-dim">{person.name} usually plays on {person.usualBoardName}</span>
      {/if}
    {/snippet}
  </PopoverMenu>
{/if}
