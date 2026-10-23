<script lang="ts">
  // Progress that lands outside the win screen's chip (Streak-Notifications board): the streak
  // extended by the day's first game, a milestone (gold, with what it unlocks), a freeze spent
  // (quiet, no confetti), a challenge done. They come with xp.gained, which only arrives once a game
  // has ended, so never mid-visit. Top right on a desktop, dropping from the top on a phone, a small
  // pill on the match screen. The hit: the dashed circle fills, the check draws itself with a burst,
  // the number rolls up. One at a time; the rest wait their turn. Reduced motion: no burst, the
  // check just appears and the number swaps.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { location } from 'svelte-spa-router'
  import { Flame, Snowflake, Target, X } from '@lucide/svelte'
  import XpBadge from './XpBadge.svelte'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import { KIND_LABEL } from '$lib/progress/look'
  import { fmtXp, toastsFor, type ProgressToast } from '$lib/progress/view'

  const SHOW_MS = 5000
  const progression = flag('progression.enabled')
  const queue: ProgressToast[] = []
  let current = $state<{ toast: ProgressToast; id: number } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = 0
  const inMatch = $derived($location.startsWith('/session/'))

  // The next one in line (none: the toast goes); dismissing one shows the next
  function showNext() {
    clearTimeout(timer)
    const next = queue.shift()
    current = next ? { toast: next, id: ++shown } : null
    if (next) timer = setTimeout(showNext, SHOW_MS)
  }

  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.xp)
  onDestroy(
    me.xp.subscribe(m => {
      if (!m || m === seen || !get(progression)) return
      queue.push(...toastsFor(m))
      if (!current) showNext()
    }),
  )
  onDestroy(() => clearTimeout(timer))

  const TONE = {
    streak: { color: 'var(--color-accent)', border: 'border-[#3a4a1c]' },
    challenge: { color: 'var(--color-accent)', border: 'border-[#3a4a1c]' },
    milestone: { color: 'var(--color-gold)', border: 'border-[#7a6420]' },
    freeze: { color: 'var(--color-ice-line)', border: 'border-[#2b4a74]' },
  } as const
  // The burst's pieces round the circle: where each flies (for a 56 px circle), its colour and shape
  const BURST = [
    [37, 12, 'var(--color-accent)', 'h'],
    [38, 45, 'var(--color-gold)', 'w'],
    [6, 50, 'var(--color-ice)', 'h'],
    [-18, 38, 'var(--color-live-text)', 'w'],
    [-52, 33, 'var(--color-text)', 'h'],
    [-53, -1, 'var(--color-accent)', 'w'],
    [-37, -25, 'var(--color-gold)', 'h'],
    [-26, -59, 'var(--color-ice)', 'w'],
    [9, -55, 'var(--color-live-text)', 'h'],
    [32, -36, 'var(--color-text)', 'w'],
  ] as const
</script>

{#snippet hit(t: ProgressToast, size: number)}
  <span class="relative block shrink-0" style="width: {size}px; height: {size}px; --tone: {TONE[t.kind].color}" aria-hidden="true">
    <span class="ring absolute inset-0 rounded-full border-2 border-(--tone)"></span>
    <span class="fill absolute inset-0 box-border rounded-full border-2 border-dashed border-(--tone) flex items-center justify-center">
      {#if t.kind === 'freeze'}
        <Snowflake size={size * 0.4} />
      {:else if t.kind === 'challenge'}
        <Target size={size * 0.4} />
      {:else}
        <svg
          width={size * 0.45}
          height={size * 0.45}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"><path class="check" pathLength="26" d="M5 12.5l4.5 4.5L19 7.5" /></svg
        >
      {/if}
    </span>
    {#if t.kind !== 'freeze'}
      {#each BURST as [x, y, color, shape], i (i)}
        <span
          class="piece absolute left-1/2 top-1/2 rounded-[2px] {shape === 'h' ? 'w-1 h-[9px]' : 'w-[6px] h-1'}"
          style="background: {color}; --x: {(x * size) / 56}px; --y: {(y * size) / 56}px"
        ></span>
      {/each}
    {/if}
  </span>
{/snippet}

{#snippet xpPill(xp: number, gold: boolean)}
  <span
    class="shrink-0 inline-flex items-center gap-[6px] rounded-full py-[2px] pl-[10px] pr-[6px] font-display font-bold text-[18px] tracking-[0.04em] text-accent-fg
           {gold ? 'bg-gold' : 'bg-accent'}">+{fmtXp(xp)}<XpBadge inverse /></span
  >
{/snippet}

{#snippet rolling(days: number)}
  <!-- Yesterday's count rolls up to today's -->
  <span class="block h-11 overflow-hidden" aria-label="{days} days">
    <span class="roll flex flex-col" aria-hidden="true">
      <span class="h-11 font-display font-bold text-[40px] leading-[44px] tracking-[0.01em] text-text-dim">{days - 1}</span>
      <span class="h-11 font-display font-bold text-[40px] leading-[44px] tracking-[0.01em] text-accent">{days}</span>
    </span>
  </span>
{/snippet}

{#if current}
  {@const t = current.toast}
  {#key current.id}
    {#if inMatch}
      <div
        role="status"
        aria-live="polite"
        class="toast pill fixed z-50 top-4 left-1/2 -translate-x-1/2 box-border flex items-center gap-3 rounded-full border bg-surface-2 py-2 pl-[10px] pr-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] {TONE[
          t.kind
        ].border}"
      >
        {@render hit(t, 36)}
        <span class="font-display font-bold text-[22px] tracking-[0.03em] whitespace-nowrap">
          {#if t.kind === 'streak'}Day {t.days}{:else if t.kind === 'milestone'}{t.days} days{:else if t.kind === 'freeze'}Streak saved{:else}Challenge
            done{/if}
        </span>
        {#if t.kind === 'streak' || t.kind === 'milestone'}<span class="flicker flex text-gold" aria-hidden="true"><Flame size={20} /></span
          >{/if}
        {#if t.kind === 'streak' && t.bonus > 0}{@render xpPill(t.bonus, false)}{/if}
        {#if t.kind === 'milestone' && t.xp > 0}{@render xpPill(t.xp, true)}{/if}
        <button
          type="button"
          onclick={showNext}
          aria-label="Dismiss"
          class="shrink-0 size-7 flex items-center justify-center rounded-full bg-transparent border-0 text-text-muted cursor-pointer hover:text-text"
          ><X size={14} /></button
        >
      </div>
    {:else}
      <div
        role="status"
        aria-live="polite"
        class:milestone={t.kind === 'milestone'}
        class="toast fixed z-50 top-4 left-4 right-4 md:left-auto md:right-5 md:top-5 md:w-[380px] box-border flex flex-col gap-[14px] rounded-[16px] border bg-surface-2 px-[18px] py-4
               shadow-[0_18px_44px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(198,242,78,0.08)] {TONE[t.kind].border}"
      >
        <button
          type="button"
          onclick={showNext}
          aria-label="Dismiss"
          class="absolute -top-2 -right-2 size-6 flex items-center justify-center rounded-full border border-line-strong bg-surface-inset text-text-muted cursor-pointer hover:text-text"
          ><X size={12} /></button
        >
        <div class="flex items-center gap-4">
          {@render hit(t, t.kind === 'milestone' ? 64 : 56)}
          <div class="flex-1 min-w-0">
            {#if t.kind === 'streak'}
              <div class="text-[12px] label-caps text-text-dim">Streak extended</div>
              <div class="flex items-center gap-2">
                {@render rolling(t.days)}
                <span class="flicker flex text-gold" aria-hidden="true"><Flame size={26} fill="rgba(242,185,78,.25)" /></span>
                <span class="text-[15px] text-text-muted">{t.days === 1 ? 'day' : 'days'}</span>
              </div>
            {:else if t.kind === 'milestone'}
              <div class="text-[12px] label-caps text-gold">Milestone</div>
              <div class="font-display font-bold text-[40px] leading-[44px]">{t.days} days</div>
            {:else if t.kind === 'freeze'}
              <div class="text-[12px] label-caps text-text-dim">Freeze used</div>
              <div class="font-display font-bold text-[34px] leading-[44px] text-ice">Streak saved</div>
            {:else if t.kind === 'challenge'}
              <div class="text-[12px] label-caps text-text-dim">Challenge complete</div>
              <div class="text-[15px] font-semibold leading-snug">{t.title}</div>
              <a href="#/progress" onclick={showNext} class="text-[13px] font-semibold no-underline">Claim +{fmtXp(t.xp)} XP on Progress</a>
            {/if}
          </div>
          {#if t.kind === 'streak' && t.bonus > 0}{@render xpPill(t.bonus, false)}{/if}
          {#if t.kind === 'milestone' && t.xp > 0}{@render xpPill(t.xp, true)}{/if}
          {#if t.kind === 'freeze'}<span class="shrink-0 text-right text-[13px] text-text-muted"
              >{t.left} {t.left === 1 ? 'freeze' : 'freezes'}<br />left</span
            >{/if}
        </div>
        {#if t.kind === 'streak'}
          <!-- The week so far: today's bar fills last -->
          <span class="grid grid-cols-7 gap-1" aria-hidden="true">
            {#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
              {@const today = Math.min(t.days, 7) - 1}
              <span class="relative h-[6px] rounded-full overflow-hidden {i < today ? 'bg-accent' : 'bg-line'}"
                >{#if i === today}<span class="grow absolute inset-0 bg-accent"></span>{/if}</span
              >
            {/each}
          </span>
        {:else if t.kind === 'milestone' && t.perks.length > 0}
          <div class="flex items-center gap-3 rounded-[10px] bg-black/28 px-3 py-[10px]">
            <span class="text-[13px] text-ink-2">New {KIND_LABEL[t.perks[0].kind].one.toLowerCase()}</span>
            <span class="ml-auto flex flex-wrap justify-end gap-2">
              {#each t.perks as p (p.id)}
                <span class="sheen-gold relative overflow-hidden rounded-full"
                  ><span
                    class="block rounded-full border border-line-chip px-4 py-2 font-display font-bold text-[14px] uppercase tracking-[0.12em]"
                    >{p.name}</span
                  ></span
                >
              {/each}
            </span>
          </div>
        {/if}
      </div>
    {/if}
  {/key}
{/if}

<style>
  .toast {
    animation: slidein 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .pill {
    animation-name: slidein-center;
  }
  .milestone {
    background: linear-gradient(135deg, #2b230c, var(--color-surface-2) 60%);
  }
  /* The hit: the circle fills at 250 ms, the check draws at 500 ms, the burst and the roll at 800 ms */
  .fill {
    color: var(--tone);
    animation: fill 0.3s 0.25s ease both;
  }
  .check {
    stroke-dasharray: 26;
    animation: draw 0.3s 0.5s ease both;
  }
  .ring {
    opacity: 0;
    animation: ring 1s 0.3s ease-out both;
  }
  .piece {
    opacity: 0;
    animation: burst 1s 0.5s ease-out both;
  }
  .roll {
    animation: roll 0.5s 0.8s cubic-bezier(0.3, 1.4, 0.5, 1) both;
  }
  .flicker {
    transform-origin: 50% 90%;
    animation: flick 1.3s ease-in-out infinite;
  }
  .grow {
    transform-origin: left;
    animation: grow 0.6s 0.8s ease both;
  }
  .sheen-gold::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(100deg, transparent, rgba(242, 185, 78, 0.45), transparent);
    animation: sheen 3.2s ease-in-out infinite;
  }
  @keyframes slidein {
    from {
      transform: translateY(-16px) scale(0.96);
      opacity: 0;
    }
  }
  @keyframes slidein-center {
    from {
      transform: translate(-50%, -16px) scale(0.96);
      opacity: 0;
    }
  }
  @keyframes fill {
    to {
      background: var(--tone);
      color: var(--color-accent-fg);
      border-style: solid;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 26;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes ring {
    10% {
      opacity: 0.7;
    }
    to {
      transform: scale(2.4);
      opacity: 0;
    }
  }
  @keyframes burst {
    0% {
      transform: translate(-50%, -50%) scale(0.4);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    to {
      transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(200deg);
      opacity: 0;
    }
  }
  @keyframes roll {
    to {
      transform: translateY(-50%);
    }
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
  @keyframes grow {
    from {
      transform: scaleX(0);
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
    .toast,
    .fill,
    .check,
    .grow,
    .flicker {
      animation-duration: 0s;
      animation-delay: 0s;
      animation-iteration-count: 1;
    }
    .roll {
      animation: none;
      transform: translateY(-50%);
    }
    .ring,
    .piece,
    .sheen-gold::after {
      display: none;
    }
  }
</style>
