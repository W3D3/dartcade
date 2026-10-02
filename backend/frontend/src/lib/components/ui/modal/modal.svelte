<script lang="ts">
  import { X } from '@lucide/svelte'
  import { cn } from '$lib/utils.js'
  import type { Snippet } from 'svelte'

  let {
    onclose,
    title,
    subtitle,
    showClose = true,
    dismissOnBackdrop = false,
    widthClass = 'max-w-md',
    zClass = 'z-50',
    class: className = '',
    children,
    footer,
  }: {
    onclose: () => void
    title?: string
    subtitle?: string
    showClose?: boolean
    dismissOnBackdrop?: boolean
    widthClass?: string
    zClass?: string
    class?: string
    children?: Snippet
    footer?: Snippet
  } = $props()

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class={cn('fixed inset-0 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4', zClass)}
  role="dialog"
  aria-modal="true"
  aria-labelledby={title ? titleId : undefined}
>
  {#if dismissOnBackdrop}
    <div class="absolute inset-0" onclick={onclose} aria-hidden="true"></div>
  {/if}

  <div
    class={cn(
      'relative w-full box-border p-5 md:p-8 rounded-t-[18px] md:rounded-[18px] bg-surface-1 border border-line-2',
      'flex flex-col gap-5 max-h-[90dvh] md:max-h-[90vh] overflow-y-auto pb-[calc(20px+env(safe-area-inset-bottom))] md:pb-8',
      '[box-shadow:0_24px_60px_rgba(0,0,0,0.5)]',
      widthClass,
      className,
    )}
  >
    {#if title || showClose}
      <div class="flex items-start justify-between">
        <div class="flex flex-col gap-1">
          {#if title}
            <h2 id={titleId} class="m-0 font-display font-bold text-[28px] uppercase leading-none">
              {title}
            </h2>
          {/if}
          {#if subtitle}
            <p class="m-0 text-[14px] text-text-muted">{subtitle}</p>
          {/if}
        </div>
        {#if showClose}
          <button
            type="button"
            onclick={onclose}
            aria-label="Close"
            class="text-text-dim hover:text-text transition-colors -mr-1 -mt-1 p-1"
          >
            <X size={20} />
          </button>
        {/if}
      </div>
    {/if}

    {@render children?.()}

    {#if footer}
      <div class="flex gap-3 justify-end pt-1">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>
