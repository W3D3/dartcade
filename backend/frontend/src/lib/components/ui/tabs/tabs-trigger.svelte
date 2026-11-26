<!-- A tab (bits-ui Tabs.Trigger): `title` for a card's big underlined view titles (match details), `line` for an underlined row of page tabs (a profile), `pill` for a
     segmented row of tabs (Friends, the lobby's side panel); size and track come from the caller. -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { Tabs as TabsPrimitive } from 'bits-ui'
  import { tv } from 'tailwind-variants'
  import { cn } from '$lib/utils.js'

  const variants = tv({
    base: 'cursor-pointer whitespace-nowrap border-0',
    variants: {
      variant: {
        title:
          'bg-transparent p-0 pb-[6px] font-display text-[24px] font-bold uppercase leading-none text-text-dim hover:text-text data-[state=active]:text-text data-[state=active]:shadow-[inset_0_-3px_0_var(--color-accent)] md:text-[32px]',
        line: '-mb-px border-b-2 border-transparent bg-transparent px-4 py-2 text-body font-semibold text-text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-text',
        pill: 'rounded-segment bg-transparent text-ink-2 hover:text-text data-[state=active]:bg-line data-[state=active]:text-text data-[state=active]:font-semibold',
      },
    },
  })

  let {
    class: className,
    variant,
    ...restProps
  }: ComponentProps<typeof TabsPrimitive.Trigger> & { variant: 'title' | 'pill' | 'line' } = $props()
</script>

<TabsPrimitive.Trigger class={cn(variants({ variant }), className)} {...restProps} />
