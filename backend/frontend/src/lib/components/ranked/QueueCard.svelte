<script lang="ts">
  // The ranked queue as the side nav's lobby card (MM-Lobby-States board): the search with its
  // timer and Cancel search, a lime card with Accept and Decline once a match is found, then
  // "accepted · waiting". Shown on every screen while you search.
  import { hrefs } from '$lib/routes'
  import { Swords, X } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { acceptMatch, cancelSearch, declineMatch } from '$lib/ranked/queue'
  import type { QueueView } from '$lib/ranked/queueCard'

  let { view }: { view: QueueView } = $props()
  let busy = $state(false)
  let error = $state('')

  async function run(request: () => Promise<string | null>) {
    busy = true
    try {
      error = (await request()) ?? ''
    } finally {
      busy = false
    }
  }
</script>

<div
  class="flex flex-col gap-2 rounded-t-[11px] border-b p-3 {view.kind === 'found'
    ? 'border-accent bg-surface-picked'
    : 'border-line-2 bg-surface-active'}"
>
  <a href={hrefs.matchmaking()} class="flex flex-col gap-2 text-text no-underline" aria-label="{view.tag}, {view.name}. {view.line}">
    <span class="flex items-center justify-between">
      <span class="inline-flex items-center gap-[7px] text-[11px] font-bold label-caps text-accent">
        {#if view.kind === 'searching'}<span class="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true"></span>{/if}
        {view.tag}
      </span>
      {#if view.kind === 'found'}
        <Swords size={16} class="text-accent" aria-hidden="true" />
      {:else}
        <span class="font-mono text-[13px] text-text-muted" role="timer" aria-label="Time">{view.clock}</span>
      {/if}
    </span>
    <span class="truncate font-display text-[22px] font-bold uppercase leading-none tracking-title">{view.name}</span>
    <span class="truncate text-[12px] text-text-muted">{view.line}</span>
  </a>

  {#if view.kind === 'found' && view.matchId}
    {@const id = view.matchId}
    <Button
      variant="accent"
      disabled={busy}
      onclick={() => void run(() => acceptMatch(id))}
      class="relative h-[44px] overflow-hidden font-display text-[20px] font-bold uppercase tracking-wordmark"
    >
      Accept <span class="ml-2 font-mono text-[14px] font-medium tracking-normal" role="timer" aria-label="Seconds left to accept"
        >{view.clock}</span
      >
      <span aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[4px] bg-accent-fg/25"
        ><span class="block h-full origin-left bg-accent-fg" style:transform="scaleX({Math.min(1, view.secondsLeft / view.acceptSeconds)})"
        ></span></span
      >
    </Button>
    <button
      type="button"
      disabled={busy}
      onclick={() => void run(() => declineMatch(id))}
      class="cursor-pointer border-0 text-[13px] text-text-muted">Decline</button
    >
  {:else if view.kind === 'searching' && view.canCancel}
    <Button variant="outline" disabled={busy} onclick={() => void run(cancelSearch)} class="h-[34px] text-[13px]"
      ><X size={14} aria-hidden="true" />{view.cancelLabel}</Button
    >
  {/if}
  {#if error}<ErrorText class="text-[12px]">{error}</ErrorText>{/if}
</div>
