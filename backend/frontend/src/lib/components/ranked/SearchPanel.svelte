<script lang="ts">
  // The running ranked search as a panel (MM-Searching, MM-Duo boards): the timer, the widening
  // range, the people and Cancel search (only whoever started it can). On the Matchmaking page and
  // in the duo's lobby.
  import { Crosshair, X } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { me } from '$lib/lobby/sockets'
  import { currentUser } from '$lib/auth'
  import { cancelSearch, searchView, startedLine } from '$lib/ranked/queue'
  import { fmtRp } from '$lib/ranked/view'
  import { stopLabel } from '$lib/ranked/queueCard'
  import { tick } from '$lib/ranked/tick'
  import { numberFlag } from '$lib/flags'
  import { ACCEPT_SECONDS } from '$shared/ranked.js'

  const search = $derived($me?.matchmaking?.search ?? null)
  const view = $derived(search ? searchView(search, $tick) : null)
  const acceptSeconds = numberFlag('matchmaking.acceptSeconds', ACCEPT_SECONDS)
  const duo = $derived(search?.mode === '2v2')
  const stop = $derived(search ? stopLabel(search, $currentUser?.id ?? null) : null)
  let busy = $state(false)
  let error = $state('')

  async function cancel() {
    busy = true
    try {
      error = (await cancelSearch()) ?? ''
    } finally {
      busy = false
    }
  }
</script>

{#if search && view}
  <section
    aria-label={view.title}
    class="box-border flex flex-col gap-4 rounded-[16px] border-2 border-accent-line bg-surface-panel px-4 py-4 md:px-6 md:py-[22px]"
  >
    <!-- Only this is announced: the timer below changes every second -->
    <span class="sr-only" role="status">Searching, {view.range}</span>
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 class="font-display text-[22px] font-bold uppercase tracking-[0.03em] md:text-[28px]">{view.title}</h2>
      <span class="text-[12px] text-text-muted md:text-[13px]">{view.format}</span>
    </div>
    <div class="flex flex-grow items-center gap-5 md:gap-7 md:px-1 md:py-[6px]">
      <div class="relative h-[120px] w-[120px] flex-shrink-0 md:h-[176px] md:w-[176px]">
        {#each [0, 0.8, 1.6] as delay (delay)}
          <span
            aria-hidden="true"
            class="absolute inset-0 animate-radar rounded-full border-2 border-accent opacity-0 motion-reduce:hidden"
            style:animation-delay="{delay}s"
          ></span>
        {/each}
        <span
          class="absolute inset-[22%] flex flex-col items-center justify-center gap-[2px] rounded-full border border-accent-line bg-surface-1"
        >
          <Crosshair size={18} class="text-accent" />
          <span role="timer" aria-label="Time searching" class="font-display text-[22px] font-bold leading-none md:text-[28px]"
            >{view.elapsed}</span
          >
        </span>
      </div>
      <div class="flex min-w-0 flex-grow flex-col gap-[14px]">
        {#if duo}
          <!-- Phones: who started it, as in MM-Lobby-Phone; the tiles below replace the range and the bar -->
          <span class="text-[13px] leading-[1.35] text-ink-2 md:hidden">{startedLine(search, $currentUser?.id ?? null)}</span>
        {/if}
        {#if search.mode === '2v2'}
          <span class="truncate text-[14px] font-semibold max-md:hidden">{view.players}</span>
        {/if}
        <div class="flex flex-col gap-1 {duo ? 'max-md:hidden' : ''}">
          <span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Rating range</span>
          <span class="text-[15px]"
            ><strong class="font-mono font-medium">{view.range}</strong>
            <span class="text-text-muted">· widens every 30 s</span></span
          >
        </div>
        {#if view.bar}
          <div class="flex w-full flex-col gap-2 {duo ? 'max-md:hidden' : ''}">
            <div class="relative h-[10px] rounded-[5px] bg-surface-chip">
              <span
                class="absolute top-0 bottom-0 rounded-[5px] border border-accent-line-strong bg-accent-line transition-[left,right] duration-700"
                style:left="{view.bar.inset}%"
                style:right="{view.bar.inset}%"
              ></span>
              <span class="absolute top-[-5px] left-1/2 -ml-[2px] h-5 w-1 rounded-[2px] bg-accent"></span>
            </div>
            <div class="flex justify-between gap-2 font-mono text-[11px] text-text-dim md:text-[12px]">
              <span>{view.bar.low}</span><span class="truncate text-accent">{view.bar.you}</span><span>{view.bar.high}</span>
            </div>
          </div>
        {/if}
        <span class="text-[13px] text-text-muted {duo ? 'max-md:hidden' : ''}">{view.searching}</span>
      </div>
    </div>
    {#if duo}
      <dl class="grid grid-cols-2 gap-[6px] text-center md:hidden">
        {#each [{ label: 'Team', value: search.rating === null ? '–' : fmtRp(search.rating) }, { label: 'Range', value: view.range.replace(' RP', '') }] as tile (tile.label)}
          <div class="rounded-[10px] bg-surface-active px-1 py-2">
            <dt class="text-[10px] uppercase tracking-[0.08em] text-text-dim">{tile.label}</dt>
            <dd class="font-display text-[20px] font-bold">{tile.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    <div class="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-4">
      <span class="flex-grow text-[13px] leading-[1.45] text-text-muted">
        Keep browsing. When a match is found, you get {$acceptSeconds} seconds to accept on any screen.{#if search.mode === '2v2'}
          Leaving the queue ends the search for your partner too.{/if}
      </span>
      {#if stop}
        <button
          type="button"
          disabled={busy}
          onclick={cancel}
          class="flex h-[52px] flex-shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-line-strong px-[22px] text-[15px] font-semibold text-text"
        >
          <X size={18} />{stop}
        </button>
      {/if}
    </div>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  </section>
{/if}
