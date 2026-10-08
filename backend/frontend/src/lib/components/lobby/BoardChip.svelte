<script lang="ts">
  // A person's board as a chip that opens what the board rule lets the viewer pick; a plain
  // label when there's nothing to pick. Each board says whether it's online (yellow when not).
  import { ChevronDown, Keyboard, Monitor } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import type { BoardChoice } from '$lib/lobby/rules'
  import BoardLabel from './BoardLabel.svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverMenu from './PopoverMenu.svelte'

  let {
    person,
    choices,
    onpick,
    onopen,
  }: {
    person: LobbyPerson
    choices: BoardChoice[]
    /** null: manual entry */
    onpick: (boardId: string | null) => void
    /** The menu opened (refresh the boards' status). */
    onopen?: () => void
  } = $props()
</script>

{#if choices.length === 0}
  <BoardLabel {person} />
{:else}
  <PopoverMenu
    label="Choose a board for {person.name}"
    {onopen}
    triggerLabel="Board for {person.name}: {person.boardName ?? 'manual entry'}. Change board"
    triggerClass="max-w-full h-[30px] md:h-[34px] box-border inline-flex items-center gap-[6px] pl-[10px] pr-2 rounded-[8px] border bg-surface-paused text-ink-soft text-[13px] font-semibold
                  {person.boardMovedBy !== null ? 'border-accent-line-strong' : 'border-line-chip'}"
  >
    {#snippet trigger()}<BoardLabel {person} /><ChevronDown size={14} class="shrink-0" />{/snippet}
    {#snippet children(close: () => void)}
      {#each choices as c (c.boardId ?? 'manual')}
        <MenuItem
          label={c.label}
          detail={c.detail}
          checked={c.current}
          onclick={() => {
            close()
            if (!c.current) onpick(c.boardId)
          }}
        >
          {#snippet leading()}
            {#if c.online === null}<Keyboard size={16} class="shrink-0 text-text-muted" />{:else}<Monitor
                size={16}
                class="shrink-0 {c.online ? 'text-text-muted' : 'text-warn'}"
              />{/if}
          {/snippet}
        </MenuItem>
      {/each}
      {#if person.usualBoardName}
        <span class="px-[10px] pt-[6px] pb-1 text-[12px] text-text-dim">{person.name} usually plays on {person.usualBoardName}</span>
      {/if}
    {/snippet}
  </PopoverMenu>
{/if}
