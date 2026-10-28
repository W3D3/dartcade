<!-- A fixed-length code, one cell per character (bits-ui PinInput: caret, selection, paste and password managers come with it). -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { PinInput } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    value = $bindable(''),
    inputRef = $bindable(null),
    maxlength,
    groupAt = 0,
    invalid = false,
    class: className,
    ...restProps
  }: Omit<ComponentProps<typeof PinInput.Root>, 'children'> & {
    /** A dash before this cell (0: none). */
    groupAt?: number
    invalid?: boolean
  } = $props()
</script>

<PinInput.Root bind:value bind:inputRef {maxlength} class={cn('flex items-center gap-2', className)} {...restProps}>
  {#snippet children({ cells })}
    {#each cells as cell, i (i)}
      {#if groupAt > 0 && i === groupAt}
        <span class="text-text-dim font-mono px-0.5">–</span>
      {/if}
      <PinInput.Cell
        {cell}
        class="flex-1 aspect-[3/4] max-w-[46px] flex items-center justify-center rounded-[10px]
               font-mono text-[24px] font-semibold border transition-colors text-text
               {invalid ? 'border-live bg-live/5' : cell.isActive ? 'border-accent bg-surface-2' : 'border-line-2 bg-surface-2'}"
      >
        {cell.char ?? ''}
        {#if cell.hasFakeCaret}
          <span class="w-[2px] h-[26px] bg-accent animate-pulse"></span>
        {/if}
      </PinInput.Cell>
    {/each}
  {/snippet}
</PinInput.Root>
