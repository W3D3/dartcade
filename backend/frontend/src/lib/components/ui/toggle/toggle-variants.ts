import { tv } from 'tailwind-variants'

// Same shape as the button component's outline/accent variants; "on" fills solid so it's unmistakable.
export const toggleVariants = tv({
  base: 'inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-2 bg-surface-2 px-3 text-[15px] font-medium font-[inherit] text-text transition-colors outline-none select-none cursor-pointer hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px] data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-fg',
})
