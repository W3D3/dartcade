<script lang="ts">
  // The game waits for the seat that's up: its controller has the game closed. Everyone sees for
  // how long (from the server's disconnectedAt); only the host gets Abort.
  import { Unplug, X } from '@lucide/svelte'
  import { formatElapsed } from '$lib/remote'

  let { name, disconnectedAt, canAbort, onabort, compact = false }: {
    name: string
    /** Server time their game closed; null if they haven't opened it since the server started. */
    disconnectedAt: string | null
    canAbort: boolean
    onabort: () => void
    compact?: boolean
  } = $props()

  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => { now = Date.now() }, 1000)
    return () => { clearInterval(t) }
  })
  const elapsed = $derived(disconnectedAt === null ? null : formatElapsed(disconnectedAt, now))
</script>

<div class="flex-1 min-h-0 flex flex-col items-center justify-center text-center overflow-hidden {compact ? 'gap-2 p-4' : 'gap-4 p-7'}">
  <span class="shrink-0 rounded-full bg-surface-paused text-ink-2 flex items-center justify-center {compact ? 'w-12 h-12' : 'w-[72px] h-[72px]'}" aria-hidden="true">
    <Unplug size={compact ? 22 : 32} strokeWidth={1.8} />
  </span>
  <span role="status" class="max-w-full [overflow-wrap:anywhere] font-display font-bold uppercase leading-[0.95] tracking-[0.01em] {compact ? 'text-[28px]' : 'text-[46px]'}">Waiting for {name}</span>
  <!-- Outside the status region, so screen readers aren't told every second -->
  <span class="inline-flex items-baseline gap-[10px] text-ink-2 {compact ? 'text-[14px]' : 'text-[18px]'}">
    {#if elapsed !== null}
      Disconnected<span class="font-mono font-medium text-text tabular-nums {compact ? 'text-[18px]' : 'text-[24px]'}">{elapsed}</span>
    {:else}
      Not connected yet
    {/if}
  </span>
  <p class="m-0 max-w-[300px] text-text-muted leading-[1.5] {compact ? 'text-[13px]' : 'text-[15px]'}">Their score is kept. The game carries on as soon as {name} is back.</p>
  {#if canAbort}
    <div class="mt-2 flex flex-col items-center gap-2">
      <button type="button" onclick={onabort}
        class="h-12 px-5 inline-flex items-center gap-2 rounded-[10px] border border-danger-line bg-transparent text-live-text text-[15px] font-semibold cursor-pointer">
        <X size={16} />Abort game
      </button>
      <span class="text-[13px] text-text-dim">Only you see this, as host.</span>
    </div>
  {/if}
</div>
