<script lang="ts">
  import { Tooltip } from 'bits-ui'

  let {
    options,
    value = $bindable(),
    onchange,
    defaultValue,
    disabled = false,
    class: className = '',
  }: {
    options: { value: unknown; label: string; tooltip?: string; disabled?: boolean; title?: string }[]
    value?: unknown
    onchange?: (v: unknown) => void
    defaultValue?: unknown
    /** Read-only: no clicks, every option dimmed except the selected one (which stays readable). */
    disabled?: boolean
    class?: string
  } = $props()

  function pick(v: unknown) {
    if (disabled) return
    value = v
    onchange?.(v)
  }

  const isNonDefault = $derived(defaultValue !== undefined && value !== defaultValue)
</script>

<div class="flex gap-1 p-1 bg-bg rounded-[10px] {className}">
  {#each options as opt (opt.label)}
    {@const isSelected = value === opt.value}
    {@const isOff = disabled || opt.disabled}
    <button
      type="button"
      onclick={() => pick(opt.value)}
      disabled={isOff}
      aria-disabled={isOff}
      title={opt.title}
      class="flex-1 h-10 rounded-[7px] text-[15px] transition-colors border-0
             {isOff ? 'cursor-not-allowed' : 'cursor-pointer'}
             {isOff && !isSelected ? 'opacity-40' : ''}
             {isSelected
        ? isNonDefault
          ? 'bg-accent/15 text-accent font-semibold ring-1 ring-accent/40 ring-inset'
          : 'bg-line text-text font-semibold'
        : 'bg-transparent text-ink-2 font-medium'}"
    >
      {#if opt.tooltip}
        <span class="flex items-center justify-center gap-1">
          {opt.label}
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  onclick={e => e.stopPropagation()}
                  class="inline-flex w-[15px] h-[15px] rounded-full border border-current/40 items-center
                         justify-center text-[10px] opacity-50 cursor-help shrink-0">?</span
                >
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="top"
                sideOffset={8}
                class="z-[9999] w-[220px] px-3 py-2 rounded-[8px] text-[13px] leading-[1.45] text-text
                       bg-[#1e211b] border border-line-3 [box-shadow:0_4px_16px_rgba(0,0,0,0.5)]
                       pointer-events-none whitespace-normal"
              >
                {opt.tooltip}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </span>
      {:else}
        {opt.label}
      {/if}
    </button>
  {/each}
</div>
