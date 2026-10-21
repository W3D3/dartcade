<script lang="ts">
  // The Progress page's day streak (Progress board): the streak, the last 7 days (played, frozen,
  // missed, today), today's first-game bonus, banked freezes and the next milestone.
  import { Check, Flame, Snowflake } from '@lucide/svelte'
  import type { components } from '$lib/api/schema'
  import { milestoneLine, weekday } from '$lib/progress/view'

  let { streak }: { streak: components['schemas']['DayStreak'] } = $props()
</script>

<section
  aria-label="Day streak"
  class="flex flex-col gap-5 box-border rounded-[14px] border border-line-2 bg-surface-2 p-[18px] md:p-[22px]"
>
  <div class="flex items-baseline justify-between">
    <span class="text-[12px] label-caps text-text-dim">Day streak</span>
    <span class="text-[13px] text-text-muted">Best {streak.best}</span>
  </div>
  <div class="flex items-center gap-3">
    <span class="flex text-accent" aria-hidden="true"><Flame size={34} /></span>
    <span class="font-display font-bold text-[64px] md:text-[84px] leading-[0.85]">{streak.current}</span>
    <span class="self-end pb-[6px] text-[16px] text-text-muted">{streak.current === 1 ? 'day' : 'days'}</span>
  </div>
  <ol class="m-0 p-0 list-none grid grid-cols-7 gap-[6px]" aria-label="The last 7 days">
    {#each streak.days as d (d.date)}
      {@const today = d.state === 'today' || d.date === streak.today}
      <li class="flex flex-col items-center gap-2 text-[12px] {today ? 'text-text' : 'text-text-dim'}">
        <span
          class="w-full max-w-10 aspect-square rounded-full box-border flex items-center justify-center border-2
                 {d.state === 'played'
            ? 'bg-accent border-accent text-accent-fg'
            : d.state === 'frozen'
              ? 'bg-ice-soft border-ice-line text-ice'
              : d.state === 'today'
                ? 'border-dashed border-accent'
                : 'border-line-key'}"
        >
          {#if d.state === 'played'}<Check size={16} strokeWidth={2.4} aria-label="Played" />
          {:else if d.state === 'frozen'}<Snowflake size={16} aria-label="Freeze used" />
          {:else if d.state === 'missed'}<span class="sr-only">Missed</span>{/if}
        </span>
        {today ? 'Today' : weekday(d.date)}
      </li>
    {/each}
  </ol>
  <div class="flex items-center justify-between gap-3 rounded-[10px] bg-surface-inset px-[14px] py-3">
    <span class="text-[14px] text-ink-2">{streak.playedToday ? 'Claimed today' : 'Finish a game to claim'}</span>
    <span class="font-display font-bold text-[26px] tracking-[0.04em] text-accent">+{streak.bonus}</span>
  </div>
  <div class="flex justify-between gap-3 text-[13px] text-text-muted">
    <span>{streak.freezes} {streak.freezes === 1 ? 'freeze' : 'freezes'}</span>
    {#if streak.nextMilestone}<span>{milestoneLine(streak.nextMilestone)}</span>{/if}
  </div>
</section>
