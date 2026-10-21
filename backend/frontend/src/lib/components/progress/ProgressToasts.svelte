<script lang="ts">
  // Progress that lands outside the win screen's chip (concept: Toasts): a streak freeze spent, a
  // milestone reached, a challenge done. They come with xp.gained, which only arrives once a game
  // has ended, so never mid-visit. One at a time, 5 s each; the rest wait their turn.
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { Flame, Snowflake, Target, X } from '@lucide/svelte'
  import { me } from '$lib/lobby/sockets'
  import { flag } from '$lib/flags'
  import { fmtXp, toastsFor, type ProgressToast } from '$lib/progress/view'

  const SHOW_MS = 5000
  const progression = flag('progression.enabled')
  const queue: ProgressToast[] = []
  let current = $state<{ toast: ProgressToast; id: number } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = 0

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
</script>

{#if current}
  {@const t = current.toast}
  <div
    role="status"
    aria-live="polite"
    class="fixed z-50 top-4 left-1/2 -translate-x-1/2 w-[min(420px,calc(100vw-32px))] box-border flex items-center gap-3
           rounded-[14px] border border-line-strong bg-surface-inset px-[14px] py-3 [box-shadow:0_24px_60px_rgba(0,0,0,0.55)]"
  >
    <span
      class="shrink-0 size-[38px] rounded-full flex items-center justify-center {t.icon === 'freeze'
        ? 'bg-ice-soft text-ice'
        : 'bg-accent text-accent-fg'}"
      aria-hidden="true"
    >
      {#if t.icon === 'freeze'}<Snowflake size={18} />{:else if t.icon === 'milestone'}<Flame size={18} />{:else}<Target size={18} />{/if}
    </span>
    <span class="flex flex-col min-w-0">
      <span class="text-[14px] font-semibold leading-tight">{t.title}</span>
      <span class="text-[12px] text-text-muted">{t.text}</span>
    </span>
    {#if t.xp}<span class="ml-auto whitespace-nowrap font-display font-bold text-[18px] tracking-[0.04em] text-accent">+{fmtXp(t.xp)}</span
      >{/if}
    <button
      type="button"
      onclick={showNext}
      aria-label="Dismiss"
      class="{t.xp
        ? ''
        : 'ml-auto'} shrink-0 size-8 flex items-center justify-center bg-transparent border-0 text-text-muted cursor-pointer"
    >
      <X size={16} />
    </button>
  </div>
{/if}
