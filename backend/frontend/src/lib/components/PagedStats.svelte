<script lang="ts">
  // A player card's stats, three to a page, in a strip one row tall: click it (or the dots) to turn
  // the page, swipe up or down on touch. Vertical scroll-snap does the swiping; the page we are on
  // is the scroll position, so a game update (a new dart) never resets it.
  import { nextPage, pageAt, type Stat } from '$lib/statPages'

  let {
    pages,
    active,
    class: className = '',
  }: {
    pages: Stat[][]
    active: boolean
    /** Sets `--stat-label` and `--stat-value` (the text sizes). */
    class?: string
  } = $props()

  let strip: HTMLDivElement
  let page = $state(0)

  const goTo = (i: number) => {
    page = i
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    strip.scrollTo({ top: i * strip.clientHeight, behavior: reduced ? 'auto' : 'smooth' })
  }
</script>

<div class="flex items-stretch gap-2 min-w-0 {className}" role="group" aria-label="Player stats" data-stat-row>
  <!-- Keyboard users turn the page with the dots; the click is the pointer's shortcut -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={strip}
    class="grow basis-auto min-w-0 overflow-y-auto snap-y snap-mandatory overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-pointer"
    style="height: calc(var(--stat-label) * 1.25 + 3px + var(--stat-value))"
    onscroll={() => (page = pageAt(strip.scrollTop, strip.clientHeight, pages.length))}
    onclick={() => goTo(nextPage(page, pages.length))}
  >
    {#each pages as stats, i (i)}
      <div
        class="grid grid-cols-3 gap-x-2 h-full snap-start snap-always"
        data-stat-page={i}
        role="group"
        aria-label="Stats {i + 1} of {pages.length}"
      >
        {#each stats as s (s.label)}
          <span class="flex flex-col justify-between gap-[3px] min-w-0" data-stat title={s.title}>
            <span
              class="text-[length:var(--stat-label)] leading-[1.15] whitespace-nowrap label-caps {active
                ? 'text-text-muted'
                : 'text-text-dim'}">{s.label}</span
            >
            <span
              class="font-display font-bold text-[length:var(--stat-value)] leading-none tabular-nums {s.dim
                ? 'text-text-muted'
                : active
                  ? 'text-text'
                  : 'text-ink-2'}">{s.value}</span
            >
          </span>
        {/each}
      </div>
    {/each}
  </div>
  <div class="flex flex-col justify-center shrink-0">
    {#each pages as _, i (i)}
      <button
        type="button"
        class="w-6 h-5 grid place-items-center rounded-full"
        aria-label="Stats page {i + 1}"
        aria-current={page === i ? 'true' : undefined}
        onclick={() => goTo(i)}
      >
        <span class="size-2 rounded-full transition-colors {page === i ? 'bg-accent' : 'bg-line-2'}"></span>
      </button>
    {/each}
  </div>
</div>
