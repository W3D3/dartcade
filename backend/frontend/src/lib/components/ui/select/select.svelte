<script lang="ts">
  // A themed dropdown (bits-ui Select) in place of a native <select>, whose option list the
  // browser draws in its own colours. The list is portalled to the body and placed by bits-ui.
  import { Select } from 'bits-ui'
  import { Check, ChevronDown } from '@lucide/svelte'

  let {
    options,
    value,
    onchange,
    label,
    class: className = '',
  }: {
    options: { value: string; label: string }[]
    value: string
    onchange: (value: string) => void
    /** The accessible name of the trigger. */
    label: string
    class?: string
  } = $props()

  const shown = $derived(options.find(o => o.value === value)?.label ?? '')
</script>

<Select.Root type="single" {value} onValueChange={onchange} items={options}>
  <Select.Trigger
    aria-label={label}
    class="h-11 min-w-[150px] flex items-center justify-between gap-3 rounded-[10px] border border-line-3 bg-transparent px-3
           text-[14px] text-text cursor-pointer font-[inherit] focus-visible:outline-2 focus-visible:outline-accent {className}"
  >
    <span class="truncate">{shown}</span>
    <ChevronDown size={16} class="shrink-0 text-text-muted" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-[60] box-border min-w-[var(--bits-select-anchor-width)] max-h-[var(--bits-select-content-available-height)] overflow-y-auto
             p-[6px] rounded-[12px] bg-surface-inset border border-line-popover outline-none
             shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
    >
      <Select.Viewport class="flex flex-col gap-[2px]">
        {#each options as o (o.value)}
          <Select.Item
            value={o.value}
            label={o.label}
            class="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 text-[14px] text-text outline-none
                   data-[highlighted]:bg-surface-key data-[selected]:text-accent"
          >
            {#snippet children({ selected })}
              {o.label}
              {#if selected}<Check size={16} />{/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
