<script lang="ts" generics="T extends string">
  // A choice as a grid of cards, a title and a line each (Tournament-Create's Game, Entry and
  // Format). A bits-ui RadioGroup: arrow keys move between cards; a disabled card says why.
  import { RadioGroup } from 'bits-ui'
  import type { Choice } from '$lib/tournaments/create'

  let {
    label,
    options,
    value,
    onchange,
    disabled = false,
    columns = 2,
  }: {
    label: string
    options: (Choice<T> & { sub: string })[]
    value: T
    onchange: (v: T) => void
    /** The whole group is locked (the tournament has entries). */
    disabled?: boolean
    /** Cards per row from md; a phone always has two. */
    columns?: 2 | 4
  } = $props()
</script>

<RadioGroup.Root
  {value}
  onValueChange={v => {
    const picked = options.find(o => o.value === v)
    if (picked) onchange(picked.value)
  }}
  {disabled}
  aria-label={label}
  class="grid grid-cols-2 gap-2.5 {columns === 4 ? 'md:grid-cols-4' : ''}"
>
  {#each options as o (o.value)}
    <RadioGroup.Item
      value={o.value}
      disabled={disabled || !!o.disabled}
      class="flex min-w-0 flex-col items-start gap-[3px] rounded-lg border-[1.5px] px-3.5 py-3 text-left
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
             disabled:cursor-not-allowed
             {o.value === value
        ? 'border-accent bg-surface-picked'
        : 'border-line-2 bg-surface-1 enabled:cursor-pointer enabled:hover:border-line-popover'}
             {o.disabled ? 'opacity-50' : ''}"
    >
      <span class="text-body font-semibold text-text">{o.label}</span>
      <span class="text-caption text-text-muted">{o.sub}</span>
      {#if o.disabled}<span class="text-caption text-text-dim">{o.disabled}</span>{/if}
    </RadioGroup.Item>
  {/each}
</RadioGroup.Root>
