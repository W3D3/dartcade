<script lang="ts">
  // The Progress page's day streak (Progress board): the streak, the last 7 days (played, frozen,
  // missed, today), today's first-game bonus, banked freezes and the next milestone.
  import { Check, Flame, Snowflake } from '@lucide/svelte'
  import type { components } from '$lib/api/schema'
  import { milestoneLine, weekday } from '$lib/progress/view'
  import XpBadge from './XpBadge.svelte'

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
    <span class="flame flex text-gold" aria-hidden="true"><Flame size={40} fill="rgba(242,185,78,.25)" /></span>
    <span class="font-display font-bold text-[64px] md:text-[84px] leading-[0.85]">{streak.current}</span>
    <span class="self-end pb-[6px] text-[16px] text-text-muted">{streak.current === 1 ? 'day' : 'days'}</span>
  </div>
  <ol class="m-0 p-0 list-none grid grid-cols-7 gap-[6px]" aria-label="The last 7 days">
    {#each streak.days as d (d.date)}
      {@const today = d.state === 'today' || d.date === streak.today}
      <li class="flex flex-col items-center gap-2 text-[12px] {today ? 'text-text' : 'text-text-dim'}">
        <span
          class="relative w-full max-w-10 aspect-square rounded-full box-border flex items-center justify-center border-2
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
          {:else if d.state === 'missed'}<span class="sr-only">Missed</span>
          {:else if d.state === 'today'}<span
              class="today-ring absolute -inset-[2px] rounded-full border-2 border-accent"
              aria-hidden="true"
            ></span>{/if}
        </span>
        {today ? 'Today' : weekday(d.date)}
      </li>
    {/each}
  </ol>
  <div class="relative overflow-hidden flex items-center justify-between gap-3 rounded-[10px] bg-surface-inset px-[14px] py-3">
    {#if !streak.playedToday}<span class="sheen absolute inset-y-0 left-0 w-2/5" aria-hidden="true"></span>{/if}
    <span class="relative text-[14px] text-ink-2">{streak.playedToday ? 'Claimed today' : 'Finish a game to claim'}</span>
    <span class="relative inline-flex items-center gap-2 font-display font-bold text-[26px] tracking-[0.04em] text-accent"
      >+{streak.bonus}<XpBadge size={24} /></span
    >
  </div>
  <div class="flex justify-between gap-3 text-[13px] text-text-muted">
    <span>{streak.freezes} {streak.freezes === 1 ? 'freeze' : 'freezes'}</span>
    {#if streak.nextMilestone}<span>{milestoneLine(streak.nextMilestone)}</span>{/if}
  </div>
</section>

<style>
  /* The flame flickers and the bonus still to win gleams; today's circle pulses until it's played */
  @media (min-width: 48rem) {
    .flame {
      transform-origin: 50% 90%;
      animation: flick 1.3s ease-in-out infinite;
    }
    .today-ring {
      animation: ring 2.4s ease-out infinite;
    }
  }
  .sheen {
    background: linear-gradient(100deg, transparent, rgba(198, 242, 78, 0.16), transparent);
    animation: sheen 3.2s ease-in-out infinite;
  }
  @keyframes flick {
    0%,
    100% {
      transform: scale(1) rotate(-2deg);
    }
    30% {
      transform: scale(1.12, 1.2) rotate(3deg);
    }
    60% {
      transform: scale(0.96, 1.05) rotate(-3deg);
    }
  }
  @keyframes ring {
    0%,
    14% {
      transform: none;
      opacity: 0;
    }
    18% {
      opacity: 0.7;
    }
    55%,
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }
  @keyframes sheen {
    0%,
    40% {
      transform: translateX(-120%);
    }
    70%,
    100% {
      transform: translateX(260%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flame,
    .today-ring,
    .sheen {
      animation: none;
    }
    .sheen {
      display: none;
    }
  }
</style>
