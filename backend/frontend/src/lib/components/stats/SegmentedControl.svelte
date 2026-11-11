<script lang="ts">
  // A row of choices where one is on (Stats.dc.html .seg): links when each has an `href` (the
  // choice lives in the URL), else buttons that call `onchange`.
  export type Segment<T extends string> = { id: T; label: string; href?: string }

  let {
    label,
    items,
    value,
    onchange,
    size = 'md',
    fill = false,
  }: {
    label: string
    items: Segment<string>[]
    value: string
    onchange?: (id: string) => void
    size?: 'md' | 'sm'
    /** Spread over the full width, the choices sharing it equally (a phone's tabs). */
    fill?: boolean
  } = $props()

  const item = $derived(
    `${size === 'sm' ? 'rounded-chip px-2.5 py-1 text-[12px]' : 'rounded-segment px-3 py-[7px] text-[13px]'}${fill ? ' flex-1 text-center' : ''}`,
  )
  const look = (on: boolean) => (on ? 'bg-line font-semibold text-text' : 'text-text-muted hover:text-text')
</script>

<div
  role="group"
  aria-label={label}
  class="flex {fill ? 'w-full' : 'w-fit'} rounded-md border border-line bg-surface-panel {size === 'sm' ? 'p-0.5' : 'p-[3px]'}"
>
  {#each items as s (s.id)}
    {#if s.href}
      <a
        href={s.href}
        aria-current={s.id === value ? 'true' : undefined}
        class="whitespace-nowrap no-underline {item} {look(s.id === value)}">{s.label}</a
      >
    {:else}
      <button
        type="button"
        aria-pressed={s.id === value}
        class="cursor-pointer whitespace-nowrap border-0 {item} {look(s.id === value)}"
        onclick={() => onchange?.(s.id)}>{s.label}</button
      >
    {/if}
  {/each}
</div>
