<script lang="ts">
  import type { Who } from '$lib/face'
  // A player in a team panel: initial, name, their board (remote games) and average, and
  // Throwing / Up next / "after".
  import Avatar from './Avatar.svelte'
  import PlayerName from './PlayerName.svelte'
  import PlayerPill from './PlayerPill.svelte'
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { TeamMember } from '$lib/teams'
  import type { SeatLine } from '$lib/remote'

  let {
    member,
    who,
    seat = null,
    compact = false,
  }: {
    member: TeamMember
    /** Whose picture and bot glyph to draw; the member's name is `member.name`. */
    who: Who
    /** Remote games: the seat's board, and "· you". */
    seat?: SeatLine | null
    compact?: boolean
  } = $props()

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
  <Avatar name={member.name} face={who.face} tone={throwing ? 'accent' : 'default'} size={30} />
  <PlayerName
    name={member.name}
    you={seat?.you ?? false}
    nameClass="{compact ? 'text-[15px]' : 'text-[17px]'} {throwing
      ? 'text-text'
      : member.role === 'up-next'
        ? 'text-ink-2'
        : 'text-text-muted'}"
    youClass="text-[12px]"
    gap="gap-[1px]"
  >
    {#snippet below()}
      <!-- No room for it next to the pill once the panel is this narrow (phones, side by side) -->
      {#if !compact}
        <span class="flex items-center gap-1 min-w-0 text-[12px] text-text-dim">
          {#if seat}<SeatBoardLine line={seat} size="sm" /><span class="shrink-0">·</span>{/if}
          <span class="shrink-0 whitespace-nowrap">{seat ? 'avg' : 'Avg'} {member.avg}</span>
        </span>
      {/if}
    {/snippet}
  </PlayerName>
  {#if !compact}
    <!-- The row's own colour already carries this in compact; no room for the pill too -->
    <span class="ml-auto shrink-0 flex items-center">
      {#if member.role === 'throwing' || member.role === 'up-next'}
        <PlayerPill kind={member.role} small />
      {:else if member.role === 'after'}
        <span class="text-[13px] text-text-dim">after</span>
      {/if}
    </span>
  {/if}
</div>
