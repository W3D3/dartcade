import { type VariantProps, tv } from 'tailwind-variants'

export const badgeVariants = tv({
  base: 'inline-flex items-center gap-2 font-semibold',
  variants: {
    variant: {
      live: 'h-[30px] px-3 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-widest',
      paired: 'h-6 px-2 rounded-full bg-accent text-accent-fg text-[11px] font-bold tracking-wide uppercase',
      // Marks a field whose data the API doesn't provide yet
      soon: 'h-5 px-2 rounded-full border border-dashed border-line-3 text-text-dim text-[10px] font-medium tracking-[0.08em] uppercase',
      // Lobby people: name tags, and where someone stands for the next game
      host: 'h-[18px] px-[6px] rounded-full bg-accent text-accent-fg text-[10px] font-bold tracking-[0.06em] uppercase shrink-0',
      guest:
        'h-[18px] px-[6px] rounded-full border border-line-strong text-ink-2 text-[10px] font-bold tracking-[0.06em] uppercase shrink-0',
      bot: 'h-[18px] px-[6px] rounded-full border border-line-strong text-ink-2 text-[10px] font-bold tracking-[0.06em] uppercase shrink-0',
      ready: 'h-8 px-[10px] rounded-full bg-accent-tint text-accent text-[12px] font-bold',
      'not-ready': 'h-8 px-[10px] rounded-full bg-surface-paused text-warn text-[12px]',
      'sits-out': 'h-8 px-[10px] rounded-full border border-dashed border-line-strong text-text-muted text-[12px] font-medium',
      pending: 'h-8 px-[10px] rounded-full bg-surface-2 text-text-dim text-[12px] font-medium',
    },
  },
})

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant']
