import { type VariantProps, tv } from 'tailwind-variants'

// `plain`: the neutral filter chip (the Coach pages)
export const chipVariants = tv({
  base: 'rounded-full text-[13px] border',
  variants: {
    variant: {
      accent: 'px-3 py-1 transition-colors',
      plain:
        'inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap px-3 no-underline cursor-pointer hover:text-text',
    },
    selected: { true: '', false: '' },
  },
  compoundVariants: [
    { variant: 'accent', selected: true, class: 'border-accent text-accent bg-accent/10' },
    { variant: 'accent', selected: false, class: 'border-line-2 text-text-muted hover:border-line-3' },
    { variant: 'plain', selected: true, class: 'border-line-popover bg-surface-paused font-semibold text-text' },
    { variant: 'plain', selected: false, class: 'border-line-2 bg-transparent text-ink-2' },
  ],
  defaultVariants: { variant: 'accent', selected: false },
})

export type ChipVariant = VariantProps<typeof chipVariants>['variant']
