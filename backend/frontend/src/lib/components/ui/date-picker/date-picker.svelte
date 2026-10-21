<script lang="ts">
  // A themed date field with a calendar popover (bits-ui DatePicker) in place of <input type="date">,
  // whose popup the browser draws in its own colours. The value is a yyyy-mm-dd string, blank for none;
  // the field follows the viewer's locale.
  import { DatePicker, type Month } from 'bits-ui'
  import type { ComponentProps } from 'svelte'
  import { parseDate, type DateValue } from '@internationalized/date'
  import { CalendarDays, ChevronLeft, ChevronRight, X } from '@lucide/svelte'

  type SegmentPart = ComponentProps<typeof DatePicker.Segment>['part']

  let {
    value,
    onchange,
    label,
    class: className = '',
  }: {
    value: string
    onchange: (value: string) => void
    /** The accessible name of the field. */
    label: string
    class?: string
  } = $props()

  const date = $derived.by(() => {
    try {
      return value ? parseDate(value) : undefined
    } catch {
      return undefined
    }
  })

  const segment = 'rounded-[4px] px-[2px] outline-none focus:bg-accent focus:text-accent-fg data-[placeholder]:text-text-dim'
  const day =
    'flex size-9 items-center justify-center rounded-[8px] text-[14px] text-text outline-none cursor-pointer hover:bg-surface-key ' +
    'data-[today]:border data-[today]:border-line-strong data-[selected]:bg-accent data-[selected]:text-accent-fg ' +
    'data-[outside-month]:pointer-events-none data-[outside-month]:opacity-30 data-[disabled]:opacity-30 data-[unavailable]:opacity-30'
  const nav =
    'flex size-8 items-center justify-center rounded-[8px] border-0 bg-transparent text-text-muted cursor-pointer hover:bg-surface-key'
</script>

<DatePicker.Root
  value={date}
  onValueChange={(v: DateValue | undefined) => onchange(v ? v.toString() : '')}
  weekStartsOn={1}
  fixedWeeks
  preventDeselect
>
  <div
    class="flex h-11 items-center gap-2 rounded-[10px] border border-line-3 px-3 text-[14px] text-text focus-within:outline-2 focus-within:outline-accent {className}"
  >
    <DatePicker.Input aria-label={label} class="flex items-center">
      {#snippet children({ segments }: { segments: { part: SegmentPart; value: string }[] })}
        {#each segments as { part, value } (part + value)}
          {#if part === 'literal'}
            <span class="text-text-dim">{value}</span>
          {:else}
            <DatePicker.Segment {part} class={segment}>{value}</DatePicker.Segment>
          {/if}
        {/each}
      {/snippet}
    </DatePicker.Input>
    {#if date}
      <button
        type="button"
        aria-label="Clear {label}"
        onclick={() => onchange('')}
        class="flex cursor-pointer items-center border-0 bg-transparent p-0 text-text-muted hover:text-text"
      >
        <X size={14} />
      </button>
    {/if}
    <DatePicker.Trigger
      aria-label="Pick {label}"
      class="flex cursor-pointer items-center border-0 bg-transparent p-0 text-text-muted hover:text-text"
    >
      <CalendarDays size={16} />
    </DatePicker.Trigger>
  </div>
  <DatePicker.Portal>
    <DatePicker.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-[60] rounded-[12px] border border-line-popover bg-surface-inset p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
    >
      <DatePicker.Calendar>
        {#snippet children({ months, weekdays }: { months: Month<DateValue>[]; weekdays: string[] })}
          <DatePicker.Header class="mb-2 flex items-center justify-between">
            <DatePicker.PrevButton class={nav} aria-label="Previous month"><ChevronLeft size={16} /></DatePicker.PrevButton>
            <DatePicker.Heading class="text-[14px] font-semibold text-text" />
            <DatePicker.NextButton class={nav} aria-label="Next month"><ChevronRight size={16} /></DatePicker.NextButton>
          </DatePicker.Header>
          {#each months as month (month.value.toString())}
            <DatePicker.Grid class="border-collapse">
              <DatePicker.GridHead>
                <DatePicker.GridRow class="flex">
                  {#each weekdays as d (d)}
                    <DatePicker.HeadCell class="w-9 text-center text-[12px] font-medium text-text-dim">{d.slice(0, 2)}</DatePicker.HeadCell>
                  {/each}
                </DatePicker.GridRow>
              </DatePicker.GridHead>
              <DatePicker.GridBody>
                {#each month.weeks as week, i (i)}
                  <DatePicker.GridRow class="flex">
                    {#each week as d (d.toString())}
                      <DatePicker.Cell date={d} month={month.value} class="p-0">
                        <DatePicker.Day class={day} />
                      </DatePicker.Cell>
                    {/each}
                  </DatePicker.GridRow>
                {/each}
              </DatePicker.GridBody>
            </DatePicker.Grid>
          {/each}
        {/snippet}
      </DatePicker.Calendar>
    </DatePicker.Content>
  </DatePicker.Portal>
</DatePicker.Root>
