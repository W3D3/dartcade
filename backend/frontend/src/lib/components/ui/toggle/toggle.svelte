<!-- An on/off button (Place ball, Debug, ...): bits-ui's Toggle, styled like the button component. -->
<script lang="ts" module>
  export { toggleVariants } from './toggle-variants.js'
</script>

<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { Toggle as TogglePrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'
  import { toggleVariants } from './toggle-variants.js'

  let { class: className, pressed = $bindable(false), ...restProps }: ComponentProps<typeof TogglePrimitive.Root> = $props()
</script>

<TogglePrimitive.Root bind:pressed class={cn(toggleVariants(), className)} {...restProps} />
