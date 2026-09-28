<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    tone = 'success',
    actionLabel,
    onaction,
    onclose,
    children,
  }: {
    tone?: 'success' | 'error'
    actionLabel?: string
    onaction?: () => void
    onclose?: () => void
    children: Snippet
  } = $props()
</script>

<div
  class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
         px-4 py-3 rounded-[12px] bg-surface-1 border border-line-2 shadow-xl max-w-[92vw]"
  role="status"
>
  <span
    class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
           {tone === 'success' ? 'bg-accent text-accent-fg' : 'bg-live text-white'}"
  >
    {#if tone === 'success'}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    {:else}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="3" stroke-linecap="round" aria-hidden="true">
        <path d="M12 8v5M12 16.5v.5" />
      </svg>
    {/if}
  </span>

  <span class="text-[14px] text-text-muted">{@render children()}</span>

  {#if actionLabel}
    <button
      type="button"
      onclick={onaction}
      class="flex-shrink-0 text-[14px] text-accent font-semibold hover:underline"
    >
      {actionLabel}
    </button>
  {/if}

  {#if onclose}
    <button
      type="button"
      onclick={onclose}
      aria-label="Dismiss"
      class="flex-shrink-0 text-text-dim hover:text-text transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  {/if}
</div>
