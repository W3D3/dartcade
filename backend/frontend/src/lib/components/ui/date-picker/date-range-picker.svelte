<script lang="ts">
  // A from–to date field with one range calendar (bits-ui DateRangePicker). Each end is a yyyy-mm-dd
  // string, blank for none; the field follows the viewer's locale.
  import { DateRangePicker, Portal, type Month } from 'bits-ui'
  import type { ComponentProps } from 'svelte'
  import { parseDate, type DateValue } from '@internationalized/date'
  import { CalendarDays, ChevronLeft, ChevronRight, X } from '@lucide/svelte'
  import { segment, rangeDay, nav, field, content } from './styles.js'

  type SegmentPart = ComponentProps<typeof DateRangePicker.Segment>['part']
  type Range = { from: string; to: string }

  let {
    from,
    to,
    onchange,
    label,
    class: className = '',
  }: Range & {
    onchange: (range: Range) => void
    /** The accessible name of the field; its ends are "<label> start" and "<label> end". */
    label: string
    class?: string
  } = $props()

  function parse(v: string): DateValue | undefined {
    try {
      return v ? parseDate(v) : undefined
    } catch {
      return undefined
    }
  }
  const range = $derived({ start: parse(from), end: parse(to) })
</script>

<DateRangePicker.Root
  value={range}
  onValueChange={v => onchange({ from: v.start?.toString() ?? '', to: v.end?.toString() ?? '' })}
  weekStartsOn={1}
  weekdayFormat="short"
  fixedWeeks
>
  <div class="{field} {className}">
    {#each ['start', 'end'] as const as type (type)}
      {#if type === 'end'}<span class="text-text-dim" aria-hidden="true">–</span>{/if}
      <DateRangePicker.Input {type} aria-label="{label} {type}" class="flex items-center">
        {#snippet children({ segments }: { segments: { part: SegmentPart; value: string }[] })}
          <!-- By position: a date has two identical separators ("/" or "."), so part + value isn't unique -->
          {#each segments as { part, value }, i (i)}
            {#if part === 'literal'}
              <span class="text-text-dim">{value}</span>
            {:else}
              <DateRangePicker.Segment {part} class={segment}>{value}</DateRangePicker.Segment>
            {/if}
          {/each}
        {/snippet}
      </DateRangePicker.Input>
    {/each}
    {#if range.start || range.end}
      <button
        type="button"
        aria-label="Clear {label}"
        onclick={() => onchange({ from: '', to: '' })}
        class="flex cursor-pointer items-center border-0 bg-transparent p-0 text-text-muted hover:text-text"
      >
        <X size={14} />
      </button>
    {/if}
    <DateRangePicker.Trigger
      aria-label="Pick {label}"
      class="ml-auto flex cursor-pointer items-center border-0 bg-transparent p-0 text-text-muted hover:text-text"
    >
      <CalendarDays size={16} />
    </DateRangePicker.Trigger>
  </div>
  <Portal>
    <DateRangePicker.Content sideOffset={6} collisionPadding={8} class={content}>
      <DateRangePicker.Calendar>
        {#snippet children({ months, weekdays }: { months: Month<DateValue>[]; weekdays: string[] })}
          <DateRangePicker.Header class="mb-2 flex items-center justify-between">
            <DateRangePicker.PrevButton class={nav} aria-label="Previous month"><ChevronLeft size={16} /></DateRangePicker.PrevButton>
            <DateRangePicker.Heading class="text-[14px] font-semibold text-text" />
            <DateRangePicker.NextButton class={nav} aria-label="Next month"><ChevronRight size={16} /></DateRangePicker.NextButton>
          </DateRangePicker.Header>
          {#each months as month (month.value.toString())}
            <DateRangePicker.Grid class="border-collapse">
              <DateRangePicker.GridHead>
                <DateRangePicker.GridRow class="flex">
                  {#each weekdays as d, i (i)}
                    <DateRangePicker.HeadCell class="w-9 text-center text-[12px] font-medium text-text-dim"
                      >{d.slice(0, 2)}</DateRangePicker.HeadCell
                    >
                  {/each}
                </DateRangePicker.GridRow>
              </DateRangePicker.GridHead>
              <DateRangePicker.GridBody>
                {#each month.weeks as week, i (i)}
                  <DateRangePicker.GridRow class="flex">
                    {#each week as d (d.toString())}
                      <DateRangePicker.Cell date={d} month={month.value} class="p-0">
                        <DateRangePicker.Day class={rangeDay} />
                      </DateRangePicker.Cell>
                    {/each}
                  </DateRangePicker.GridRow>
                {/each}
              </DateRangePicker.GridBody>
            </DateRangePicker.Grid>
          {/each}
        {/snippet}
      </DateRangePicker.Calendar>
    </DateRangePicker.Content>
  </Portal>
</DateRangePicker.Root>
