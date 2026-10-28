<!-- A themed single-value slider (bits-ui Slider) in place of <input type="range">, which the browser draws in its own colours. -->
<script lang="ts">
  import { Slider as SliderPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    onchange,
    label,
    labelledby,
    class: className,
  }: {
    value?: number
    min?: number
    max?: number
    step?: number
    /** While dragging, every step. */
    onchange?: (value: number) => void
    /** The thumb's accessible name, or the id of the element naming it. */
    label?: string
    labelledby?: string
    class?: string
  } = $props()
</script>

<SliderPrimitive.Root
  type="single"
  bind:value
  onValueChange={onchange}
  {min}
  {max}
  {step}
  class={cn('relative flex h-6 w-full touch-none select-none items-center', className)}
>
  <span class="relative h-[6px] w-full grow overflow-hidden rounded-full bg-line-chip">
    <SliderPrimitive.Range class="absolute h-full bg-accent" />
  </span>
  <SliderPrimitive.Thumb
    index={0}
    aria-label={label}
    aria-labelledby={labelledby}
    class="block size-[18px] rounded-full border-2 border-accent bg-text cursor-grab active:cursor-grabbing
           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  />
</SliderPrimitive.Root>
