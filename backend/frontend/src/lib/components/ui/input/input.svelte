<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements'

  type InputType = Exclude<HTMLInputTypeAttribute, 'file'>

  // Svelte types an input's value as any; narrow it to what an input actually holds
  type Props = WithElementRef<
    Omit<HTMLInputAttributes, 'type' | 'value' | 'size'> & {
      value?: string | number | null
      /** lg: the tall field above a primary button (auth forms); md matches the buttons beside it */
      size?: 'md' | 'lg'
    } & ({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
  >

  let {
    ref = $bindable(null),
    value = $bindable(),
    type,
    files = $bindable(),
    size = 'md',
    class: className,
    'data-slot': dataSlot = 'input',
    ...restProps
  }: Props = $props()
</script>

{#if type === 'file'}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(
      size === 'lg' ? 'h-(--control-h-lg)' : 'h-(--control-h)',
      'w-full min-w-0 rounded-md border border-line-3 bg-surface-2 px-4 text-base text-text outline-none placeholder:text-[#7d7f74] focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    type="file"
    bind:files
    bind:value
    {...restProps}
  />
{:else}
  <input
    bind:this={ref}
    data-slot={dataSlot}
    class={cn(
      size === 'lg' ? 'h-(--control-h-lg)' : 'h-(--control-h)',
      'w-full min-w-0 rounded-md border border-line-3 bg-surface-2 px-4 text-base text-text outline-none placeholder:text-[#7d7f74] focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
      className,
    )}
    {type}
    bind:value
    {...restProps}
  />
{/if}
