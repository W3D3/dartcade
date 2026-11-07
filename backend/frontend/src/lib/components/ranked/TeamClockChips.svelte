<script lang="ts">
  // A team's Turn and Reserve chips (MM-Match-Teams board): the visit's time for the team that is up,
  // the full visit for the other, and the team's shared reserve. Red once the time is nearly gone.
  import { tick } from '$lib/ranked/tick'
  import { teamClocks, type TeamRanked } from '$lib/ranked/teams'

  let { team, seat, up }: { team: TeamRanked; seat: number; up: boolean } = $props()

  const c = $derived(teamClocks(team.ranked, seat, up, team.skew, $tick))
  const chip = 'inline-flex h-[30px] items-center gap-[6px] rounded-[8px] border px-[9px] whitespace-nowrap'
  const tone = $derived(
    c.low
      ? 'border-live bg-live-soft text-live-text'
      : c.running
        ? 'border-accent-line-strong text-accent'
        : 'border-line-chip text-text-muted',
  )
</script>

<span class="flex items-center justify-end gap-[6px]">
  <span class={chip + ' ' + tone} role="timer" aria-label="Turn timer: {c.turn}{c.running ? '' : ', not running'}">
    <span class="text-[11px] font-semibold uppercase tracking-[0.08em]">Turn</span>
    <span class="font-display text-[20px] font-bold tabular-nums">{c.turn}</span>
  </span>
  <span class="{chip} border-line-chip text-text-muted" role="timer" aria-label="Reserve: {c.reserve}">
    <span class="text-[11px] font-semibold uppercase tracking-[0.08em]">Reserve</span>
    <span class="font-display text-[20px] font-bold tabular-nums">{c.reserve}</span>
  </span>
</span>
