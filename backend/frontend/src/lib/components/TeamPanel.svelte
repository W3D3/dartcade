<script lang="ts">
  // One team of a team game (X01): its players, the shared score, can finish, team and match
  // averages, darts, and the team's visits marked by who threw them. Match-Teams on the canvas.
  import type { Snippet } from 'svelte'
  import Chalkboard from './Chalkboard.svelte'
  import LegPips from './LegPips.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import { x01Roll } from '$lib/playerStats'
  import PlayerPill from './PlayerPill.svelte'
  import TeamMemberRow from './TeamMemberRow.svelte'
  import type { X01TeamView } from '$lib/teams'
  import type { SeatLine } from '$lib/remote'
  import { playerCard } from '$lib/playerCard'

  let {
    team,
    seats,
    bots,
    chalkboard,
    compact = false,
    overlay,
  }: {
    team: X01TeamView
    /** Per seat (the snapshot's seat order): its board line in a remote game, else null. */
    seats: (SeatLine | null)[]
    /** Per seat (the snapshot's seat order): its bot info, else null. */
    bots: ({ level: number } | null)[]
    chalkboard: boolean
    /** Phones and narrow screens, where the two panels are stacked: smaller score, no chalkboard. */
    compact?: boolean
    /** Covers the score and stats, below the players (the waiting card while a player of this team is away). */
    overlay?: Snippet
  } = $props()

  const up = $derived(team.members.find(m => m.role === 'throwing') ?? team.members.find(m => m.role === 'up-next') ?? null)
  const status = $derived(up ? `${up.name} ${up.role === 'throwing' ? 'throwing' : 'up next'}` : team.won ? 'winner' : 'waiting')
  const stats = $derived([
    { label: 'Team avg', value: team.teamAvg, dim: false },
    { label: 'Match avg', value: team.matchAvg, dim: true },
    { label: 'Checkout', value: team.checkout, dim: true },
    { label: 'Darts', value: String(team.darts), dim: false },
  ])
</script>

<section
  aria-label="{team.name}, {status}, {team.remaining} left"
  class="flex-1 min-w-0 min-h-0 box-border rounded-[18px] flex flex-col overflow-hidden
         {compact ? 'px-[14px] py-3 gap-2' : 'px-[26px] py-6 gap-[14px]'}
         {playerCard(team.active)}"
>
  <div class="flex items-center justify-between gap-3">
    <span
      class="inline-flex items-center h-[30px] px-3 box-border rounded-[8px] font-display font-bold text-[18px] tracking-[0.06em] uppercase whitespace-nowrap
                 {team.active ? 'bg-accent text-accent-fg' : 'border-2 border-text text-text'}">{team.name}</span
    >
    <span class="flex items-center gap-3">
      {#if team.won}<PlayerPill kind="winner" small />{/if}
      {#if team.firstTo > 1 || !compact}<LegPips total={team.firstTo} won={team.legsWon} active={team.active} />{/if}
    </span>
  </div>

  <div class="flex flex-col gap-[6px]">
    {#each team.members as m (m.seat)}
      <TeamMemberRow member={m} seat={seats[m.seat] ?? null} bot={bots[m.seat] ?? null} {compact} />
    {/each}
  </div>

  <div class="relative flex-1 min-h-0 flex flex-col {compact ? 'gap-2' : 'gap-[14px]'}">
    <span
      class="font-display font-bold leading-[0.8] tracking-[-0.02em] tabular-nums
                 {compact ? 'text-[min(104px,9vh)]' : 'text-[min(220px,24vh)]'} {team.active ? 'text-text' : 'text-ink-3'}"
      ><RollingNumber {...x01Roll(team)} /></span
    >

    {#if !team.opened}
      <span class="text-[13px] label-caps text-text-muted">Needs to open</span>
    {:else if !team.active && team.canFinish}
      <span class="flex items-baseline gap-[10px]">
        <span class="text-[12px] label-caps text-text-dim">Can finish</span>
        <span class="font-display font-bold leading-none text-ink-3 {compact ? 'text-[22px]' : 'text-[28px]'}">{team.canFinish}</span>
      </span>
    {/if}

    <div class="flex flex-wrap {compact ? 'gap-x-[14px] gap-y-1' : 'gap-x-7 gap-y-2'}">
      {#each stats as s (s.label)}
        <span class="flex flex-col {compact ? 'gap-[1px]' : 'gap-1'}">
          <span
            class="uppercase whitespace-nowrap {compact ? 'text-[10px] tracking-[0.08em]' : 'text-[13px] tracking-[0.1em]'} text-text-muted"
            >{s.label}</span
          >
          <span
            class="font-display font-bold leading-none tabular-nums {compact ? 'text-[22px]' : 'text-[44px]'}
                       {s.dim ? 'text-text-muted' : team.active ? 'text-text' : 'text-ink-2'}">{s.value}</span
          >
        </span>
      {/each}
    </div>

    {#if chalkboard}
      <Chalkboard
        visits={team.visits}
        marks={team.marks}
        current={team.current}
        currentMark={team.currentMark}
        active={team.active}
        label="Team chalkboard: who scored, and points left after each visit"
      />
    {/if}

    {#if overlay}
      <div class="absolute inset-0 rounded-[12px] bg-surface-panel/90 flex">{@render overlay()}</div>
    {/if}
  </div>
</section>
