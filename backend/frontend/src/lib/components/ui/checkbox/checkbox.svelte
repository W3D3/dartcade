<!-- A themed checkbox (bits-ui Checkbox) in place of <input type="checkbox">, which the browser draws in its own colours. Wrap it in a <label> with its text. -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { Checkbox as CheckboxPrimitive } from 'bits-ui'
  import { Check } from '@lucide/svelte'
  import { cn } from '$lib/utils.js'

  let { class: className, checked = $bindable(false), ...restProps }: ComponentProps<typeof CheckboxPrimitive.Root> = $props()
</script>

<CheckboxPrimitive.Root
  bind:checked
  class={cn(
    'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-line-chip bg-surface-2 p-0 text-accent-fg cursor-pointer transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
    className,
  )}
  {...restProps}
>
  {#snippet children({ checked })}
    {#if checked}<Check class="size-[80%]" strokeWidth={3} />{/if}
  {/snippet}
</CheckboxPrimitive.Root>
