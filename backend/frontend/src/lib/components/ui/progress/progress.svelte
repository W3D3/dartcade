<!-- A progress bar (bits-ui Progress): `class` styles the track (height, colour, radius), `fill` the bar inside it. -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { Progress as ProgressPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    value,
    max = 100,
    class: className,
    fill = 'bg-accent',
    ...restProps
  }: Omit<ComponentProps<typeof ProgressPrimitive.Root>, 'value' | 'children' | 'child'> & {
    value: number
    /** The fill's classes: colour, radius, stripes, transition. */
    fill?: string
  } = $props()
</script>

<ProgressPrimitive.Root bind:ref {value} {max} class={cn('block overflow-hidden', className)} {...restProps}>
  <span class={cn('block h-full', fill)} style:width="{(value / max) * 100}%"></span>
</ProgressPrimitive.Root>
