<!-- An on/off switch (bits-ui Switch): `md` for a settings row, `sm` beside a short label (wrap both in a <label>). -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { Switch as SwitchPrimitive } from 'bits-ui'
  import { tv } from 'tailwind-variants'
  import { cn } from '$lib/utils.js'

  const variants = tv({
    slots: {
      root:
        'relative shrink-0 rounded-full border p-0 cursor-pointer transition-colors motion-reduce:transition-none ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
        'disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-accent data-[state=checked]:border-accent',
      thumb: 'block absolute rounded-full transition-transform motion-reduce:transition-none data-[state=checked]:bg-accent-fg',
    },
    variants: {
      size: {
        md: {
          root: 'w-12 h-7 border-transparent bg-line-chip',
          thumb: 'top-[2px] left-[2px] size-[22px] bg-text data-[state=checked]:translate-x-5',
        },
        sm: {
          root: 'w-[34px] h-5 border-line-chip bg-surface-key',
          thumb: 'top-[2px] left-[2px] size-[14px] bg-text-muted data-[state=checked]:translate-x-[14px]',
        },
      },
    },
    defaultVariants: { size: 'md' },
  })

  let {
    class: className,
    checked = $bindable(false),
    size = 'md',
    ...restProps
  }: ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'md' | 'sm' } = $props()
  const styles = $derived(variants({ size }))
</script>

<SwitchPrimitive.Root bind:checked class={cn(styles.root(), className)} {...restProps}>
  <SwitchPrimitive.Thumb class={styles.thumb()} />
</SwitchPrimitive.Root>
