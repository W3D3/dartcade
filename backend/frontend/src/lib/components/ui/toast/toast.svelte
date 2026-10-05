<script lang="ts">
  import { CircleAlert, CircleCheck, X } from '@lucide/svelte'
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
  {#if tone === 'success'}
    <CircleCheck size={24} class="flex-shrink-0 text-accent" />
  {:else}
    <CircleAlert size={24} class="flex-shrink-0 text-live" />
  {/if}

  <span class="text-[14px] text-text-muted">{@render children()}</span>

  {#if actionLabel}
    <button type="button" onclick={onaction} class="flex-shrink-0 text-[14px] text-accent font-semibold hover:underline">
      {actionLabel}
    </button>
  {/if}

  {#if onclose}
    <button type="button" onclick={onclose} aria-label="Dismiss" class="flex-shrink-0 text-text-dim hover:text-text transition-colors">
      <X size={16} />
    </button>
  {/if}
</div>
