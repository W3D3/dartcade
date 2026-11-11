<script lang="ts">
  // Achievement unlocks (Badge-Unlock board): a big toast top right with the badge, the name, the XP
  // and two actions; tier ups say old → new tier; several at once lead with the biggest and fold the
  // rest into a chip. On a phone it drops from the top with no buttons and a tap opens the page; on
  // the match screen it is a pill at the top. Six seconds, kept open while the pointer is on it.
  // They come with achievement.unlocked, sent when a game has ended. Reduced motion: no drop.
  import { hrefs } from '$lib/routes'
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { location } from 'svelte-spa-router'
  import { X } from '@lucide/svelte'
  import Badge from './Badge.svelte'
  import XpBadge from '$lib/components/progress/XpBadge.svelte'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import { fetchAchievements, saveShowcase } from '$lib/achievements/store'
  import { toastFor, type UnlockToast } from '$lib/achievements/toasts'
  import { fmtXp } from '$lib/progress/view'
  import { SHOWCASE_SIZE } from '$shared/achievements.js'

  const SHOW_MS = 6000
  const on = flag('achievements.enabled')
  const queue: UnlockToast[] = []
  let current = $state<{ toast: UnlockToast; id: number } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = 0
  let hovered = false
  const inMatch = $derived($location.startsWith('/session/'))

  function showNext() {
    clearTimeout(timer)
    const next = queue.shift()
    current = next ? { toast: next, id: ++shown } : null
    if (next) timer = setTimeout(close, SHOW_MS)
  }
  // Hovering holds the toast; it goes the moment the pointer leaves after its time is up
  let due = false
  function close() {
    if (hovered) due = true
    else showNext()
  }
  const hover = (on: boolean) => {
    hovered = on
    if (!on && due) {
      due = false
      showNext()
    }
  }

  // Only what arrives from now on: the last message from before isn't news
  const seen = get(me.achievements)
  onDestroy(
    me.achievements.subscribe(m => {
      if (!m || m === seen || !get(on)) return
      const t = toastFor(m)
      if (!t) return
      queue.push(t)
      if (!current) showNext()
    }),
  )
  onDestroy(() => clearTimeout(timer))

  // Silver, gold, platinum, Dartcade; the first tier is lime
  const TONE = ['', 'var(--color-accent)', '#c9d0d8', 'var(--color-gold)', '#8fdcec', 'var(--color-accent)']
  async function showOnProfile(id: string) {
    const ids = (await fetchAchievements())?.showcase ?? []
    if (!ids.includes(id) && ids.length < SHOWCASE_SIZE) await saveShowcase([...ids, id])
    showNext()
  }
</script>

{#snippet xp(n: number, tone: string)}
  <span
    class="shrink-0 inline-flex items-center gap-[6px] rounded-full py-[2px] pl-[10px] pr-[6px] font-display font-bold text-lead tracking-section text-accent-fg"
    style="background: {tone}">+{fmtXp(n)}<XpBadge inverse /></span
  >
{/snippet}

{#if current}
  {@const t = current.toast}
  {@const tone = TONE[t.badge.tier]}
  {#key current.id}
    {#if inMatch}
      <div
        role="status"
        aria-live="polite"
        class="toast pill fixed z-50 top-4 left-1/2 -translate-x-1/2 box-border flex items-center gap-3 rounded-full border bg-surface-2 py-2 pl-2 pr-3 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)]"
        style="border-color: {tone}"
      >
        <Badge badge={t.badge} size={40} label={false} />
        <span class="flex flex-col leading-none">
          <span class="text-caption label-caps" style="color: {tone}">New achievement</span>
          <span class="mt-1 font-display font-bold text-lead uppercase tracking-[0.03em] whitespace-nowrap"
            >{t.badge.def.name}{t.badge.oneOff ? '' : ` · Tier ${t.badge.tier}`}</span
          >
        </span>
        {@render xp(t.xp, tone)}
      </div>
    {:else}
      <div
        role="status"
        aria-live="polite"
        onpointerenter={() => hover(true)}
        onpointerleave={() => hover(false)}
        class="toast fixed z-50 inset-x-4 top-4 md:left-auto md:right-6 md:top-6 md:w-[420px] box-border flex flex-col gap-3 rounded-popover border-2 bg-surface-2 p-4 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75)]"
        style="border-color: {tone}"
      >
        <!-- A phone has no buttons: a tap opens the badge -->
        <a
          href={hrefs.achievements()}
          onclick={showNext}
          aria-label="Open {t.badge.def.name}"
          class="absolute inset-0 rounded-card md:hidden"
        ></a>
        <button
          type="button"
          onclick={showNext}
          aria-label="Dismiss"
          class="absolute right-2 top-2 hidden md:flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-text-muted cursor-pointer hover:text-text"
          ><X size={14} /></button
        >
        <div class="flex items-center gap-4">
          <span class="badge-in"><Badge badge={t.badge} size={96} label={false} /></span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-caption label-caps" style="color: {tone}">{t.kicker}</span>
            <span class="type-card-title font-bold leading-none tracking-title">{t.badge.def.name}</span>
            <span class="text-small text-text-muted"
              >{t.badge.def.description}{t.badge.oneOff ? '' : ` Tier ${t.badge.tier} of ${t.badge.def.thresholds.length}.`}</span
            >
          </div>
          {@render xp(t.xp, tone)}
        </div>
        {#if t.tierUp}
          <div class="flex items-center gap-3 text-label">
            <span class="font-semibold text-text-muted">{t.tierUp.from}</span>
            <span aria-hidden="true">→</span>
            <span class="font-semibold" style="color: {tone}">{t.tierUp.to}</span>
            {#if t.tierUp.next && t.tierUp.target}
              <span class="ml-auto text-caption text-text-dim">{t.tierUp.next} · {t.tierUp.count} of {t.tierUp.target}</span>
            {/if}
          </div>
        {/if}
        {#if t.more > 0}
          <a
            href={hrefs.achievements()}
            onclick={showNext}
            class="relative self-start rounded-full bg-surface-chip px-3 py-1 text-small font-semibold text-text no-underline"
            >+{t.more} more {t.more === 1 ? 'achievement' : 'achievements'} from this game ›</a
          >
        {/if}
        <div class="hidden md:flex items-center gap-3">
          <button
            type="button"
            onclick={() => showOnProfile(t.badge.def.id)}
            class="rounded-md border border-accent bg-accent px-4 py-2 font-display font-bold text-body uppercase tracking-cta text-accent-fg cursor-pointer hover:bg-accent-hover"
            >Show on profile</button
          >
          <a href={hrefs.achievements()} onclick={showNext} class="text-label font-semibold text-text no-underline">All achievements ›</a>
        </div>
      </div>
    {/if}
  {/key}
{/if}

<style>
  .toast {
    animation: drop 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  .badge-in {
    animation: land 0.7s cubic-bezier(0.2, 1.4, 0.4, 1) 0.2s both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-24px);
    }
  }
  @keyframes land {
    from {
      transform: scale(0);
    }
    60% {
      transform: scale(1.18);
    }
  }
  .pill.toast {
    animation-name: drop-pill;
  }
  @keyframes drop-pill {
    from {
      opacity: 0;
      transform: translate(-50%, -24px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast,
    .badge-in {
      animation: none;
    }
  }
</style>
