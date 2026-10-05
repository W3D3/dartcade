import { type VariantProps, tv } from 'tailwind-variants'
import { type WithElementRef } from '$lib/utils.js'
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

export const buttonVariants = tv({
  base: 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-opacity outline-none select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px]',
  variants: {
    variant: {
      primary: 'h-[54px] px-6 rounded-[10px] bg-accent text-accent-fg font-display font-bold text-xl tracking-widest uppercase',
      accent: 'h-11 px-4 rounded-[10px] bg-accent text-accent-fg text-[15px] font-bold',
      secondary: 'h-[56px] px-6 rounded-[12px] bg-text text-accent-fg font-display font-bold text-xl uppercase tracking-widest',
      ghost: 'h-10 px-[14px] rounded-[10px] border border-line-3 text-ink-2 text-sm',
      outline: 'h-10 px-4 rounded-[10px] border border-line-3 text-text text-sm',
      'accent-outline': 'h-10 px-4 rounded-[10px] border-2 border-accent text-accent text-[15px] font-bold',
      // Filled, small: on the lobby code chip
      key: 'h-9 px-3 rounded-[8px] border-0 bg-surface-key text-text text-[14px] font-semibold',
      destructive: 'h-10 px-4 rounded-[10px] border border-live-text text-live-text text-sm',
    },
    // Heights only (each variant has its own default); icon: a square for one icon
    size: {
      sm: 'h-9',
      md: 'h-11',
      lg: 'h-12',
      xl: 'h-14',
      icon: 'size-11 px-0',
    },
    // A toggle that's on (an open panel, say)
    pressed: {
      true: 'bg-accent-tint',
    },
  },
  defaultVariants: { variant: 'primary' },
})

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant']
export type ButtonSize = VariantProps<typeof buttonVariants>['size']

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
  WithElementRef<HTMLAnchorAttributes> & {
    variant?: ButtonVariant
    size?: ButtonSize
    /** Styles a toggle that's on; set aria-pressed or aria-expanded yourself. */
    pressed?: boolean
  }
