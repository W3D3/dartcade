<script lang="ts">
  // A player in a team panel: initial, name, their board (remote games) and average, and
  // Throwing / Up next / "after".
  import PlayerPill from './PlayerPill.svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { TeamMember } from '$lib/teams'
  import type { SeatLine } from '$lib/remote'

  let {
    member,
    seat = null,
    compact = false,
  }: {
    member: TeamMember
    /** Remote games: the seat's board, and "· you". */
    seat?: SeatLine | null
    compact?: boolean
  } = $props()

  const initial = $derived(member.name.trim().charAt(0).toUpperCase() || '?')
  const throwing = $derived(member.role === 'throwing')
</script>

<div
  class="flex items-center gap-[10px] box-border px-[10px] rounded-[10px] border {compact ? 'h-10' : 'h-[46px]'}
            {throwing
    ? 'bg-surface-hover border-accent-line-strong'
    : member.role === 'up-next'
      ? 'bg-surface-row border-line-2'
      : 'border-line'}"
>
  <span
    class="w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center font-bold text-[13px]
               {throwing ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}"
    aria-hidden="true">{initial}</span
  >
  <span class="flex flex-col gap-[1px] min-w-0">
    <span
      class="font-semibold leading-[1.1] truncate {compact ? 'text-[15px]' : 'text-[17px]'}
                 {throwing ? 'text-text' : member.role === 'up-next' ? 'text-ink-2' : 'text-text-muted'}"
      >{member.name}{#if seat?.you}<span class="text-[12px] font-medium text-accent"> · you</span>{/if}</span
    >
    <span class="flex items-center gap-1 min-w-0 text-[12px] text-text-dim">
      {#if seat}<SeatBoardLine line={seat} size="sm" /><span class="shrink-0">·</span>{/if}
      <span class="shrink-0 whitespace-nowrap">{seat ? 'avg' : 'Avg'} {member.avg}</span>
    </span>
  </span>
  <span class="ml-auto shrink-0 flex items-center">
    {#if member.role === 'throwing' || member.role === 'up-next'}
      <PlayerPill kind={member.role} small />
    {:else if member.role === 'after'}
      <span class="text-[13px] text-text-dim">after</span>
    {/if}
  </span>
</div>
