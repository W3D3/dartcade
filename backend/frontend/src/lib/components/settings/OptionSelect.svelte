<script lang="ts" module>
  export type SelectOption = { value: string; label: string; /** Small text on the right, e.g. a count. */ meta?: string }
  export type SelectGroup = { heading?: string; options: SelectOption[] }
</script>

<script lang="ts">
  // A menu of options in the game settings drawer that opens upwards (Settings-InGame board), in
  // groups with an optional heading. An open menu takes Escape for itself (and marks it handled),
  // so the drawer stays open.
  import { Select } from 'bits-ui'
  import { Check, ChevronUp } from '@lucide/svelte'

  let {
    value,
    groups,
    labelledby,
    onchange,
    empty = '',
    class: triggerClass = 'min-w-[200px] max-w-[60%]',
  }: {
    /** The picked option's value; one that isn't listed shows `empty`. */
    value: string
    groups: SelectGroup[]
    labelledby: string
    onchange: (value: string) => void
    /** The trigger's text when nothing listed is picked. */
    empty?: string
    /** The trigger's width. */
    class?: string
  } = $props()

  const items = $derived(groups.flatMap(g => g.options.map(o => ({ value: o.value, label: o.label }))))
  const current = $derived(items.find(i => i.value === value))
</script>

<Select.Root
  type="single"
  value={current?.value ?? ''}
  onValueChange={(v: string) => {
    onchange(v)
  }}
  {items}
  disabled={items.length === 0}
>
  <Select.Trigger
    aria-labelledby={labelledby}
    class="h-11 px-[14px] pr-3 flex items-center justify-between gap-[10px] rounded-[10px] {triggerClass}
           border border-line-3 data-[state=open]:border-accent bg-surface-inset text-text text-[15px] cursor-pointer
           disabled:cursor-not-allowed disabled:text-text-dim"
  >
    <span class="truncate">{current?.label ?? empty}</span>
    <ChevronUp size={16} class="shrink-0" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      side="top"
      align="end"
      sideOffset={8}
      class="z-[60] w-[300px] max-w-[calc(100vw-32px)] max-h-[min(420px,var(--bits-select-content-available-height))] box-border p-[6px]
             rounded-xl bg-surface-hover border border-line-popover [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] outline-none"
    >
      <Select.Viewport class="flex flex-col gap-[2px]">
        {#each groups as group, g (g)}
          {#if group.options.length}
            <Select.Group>
              {#if group.heading}
                <Select.GroupHeading class="px-[10px] {g === 0 ? 'pt-[6px]' : 'pt-2'} pb-[2px] text-[11px] label-caps text-text-dim"
                  >{group.heading}</Select.GroupHeading
                >
              {/if}
              {#each group.options as o (o.value)}
                {@render option(o)}
              {/each}
            </Select.Group>
          {/if}
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

{#snippet option(o: SelectOption)}
  <Select.Item
    value={o.value}
    label={o.label}
    class="h-10 px-[10px] flex items-center gap-[10px] rounded-lg cursor-pointer outline-none
           data-[highlighted]:bg-surface-paused data-[selected]:bg-surface-paused"
  >
    {#snippet children({ selected })}
      <span class="flex-grow min-w-0 truncate text-[15px] text-text">{o.label}</span>
      {#if o.meta}<span class="text-[12px] text-text-dim whitespace-nowrap">{o.meta}</span>{/if}
      <span class="w-4 flex"
        >{#if selected}<Check size={16} strokeWidth={3} class="text-accent" />{/if}</span
      >
    {/snippet}
  </Select.Item>
{/snippet}
