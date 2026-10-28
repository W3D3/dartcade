<script lang="ts">
  // One of a few options side by side (bits-ui RadioGroup: a radio group, arrow keys move between options).
  import { RadioGroup, Tooltip } from 'bits-ui'

  let {
    options,
    value = $bindable(),
    onchange,
    defaultValue,
    disabled = false,
    label,
    labelledby,
    class: className = '',
  }: {
    options: { value: unknown; label: string; tooltip?: string; disabled?: boolean; title?: string }[]
    value?: unknown
    onchange?: (v: unknown) => void
    defaultValue?: unknown
    /** Read-only: no clicks, every option dimmed except the selected one (which stays readable). */
    disabled?: boolean
    /** The group's accessible name, or the id of the element naming it. */
    label?: string
    labelledby?: string
    class?: string
  } = $props()

  // Radio values are strings; options' values can be anything, so each goes by its position
  const selected = $derived(String(options.findIndex(o => o.value === value)))

  function pick(i: string) {
    const opt = options[Number(i)]
    if (disabled) return
    value = opt.value
    onchange?.(opt.value)
  }

  const isNonDefault = $derived(defaultValue !== undefined && value !== defaultValue)
</script>

<RadioGroup.Root
  value={selected}
  onValueChange={pick}
  orientation="horizontal"
  aria-label={label}
  aria-labelledby={labelledby}
  class="flex gap-1 p-1 bg-bg rounded-[10px] {className}"
>
  {#each options as opt, i (opt.label)}
    {@const isSelected = value === opt.value}
    {@const isOff = disabled || opt.disabled}
    <RadioGroup.Item
      value={String(i)}
      disabled={isOff}
      title={opt.title}
      class="flex-1 min-h-10 px-1 py-1.5 rounded-[7px] text-[15px] leading-tight transition-colors border-0
             focus-visible:outline-2 focus-visible:outline-accent
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
                       bg-[#1e211b] border border-line-3 shadow-tooltip
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
    </RadioGroup.Item>
  {/each}
</RadioGroup.Root>
