<!-- One option of a RadioGroup, in one of the app's radio looks (radio-group-variants.ts). -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import type { VariantProps } from 'tailwind-variants'
  import { RadioGroup } from 'bits-ui'
  import { cn } from '$lib/utils.js'
  import { radioItemVariants } from './radio-group-variants.js'

  let {
    variant,
    class: className,
    ...restProps
  }: ComponentProps<typeof RadioGroup.Item> & VariantProps<typeof radioItemVariants> = $props()
</script>

<RadioGroup.Item class={cn(radioItemVariants({ variant }), className)} {...restProps} />
