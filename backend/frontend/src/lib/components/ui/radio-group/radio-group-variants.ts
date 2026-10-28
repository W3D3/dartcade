import { tv } from 'tailwind-variants'

// The looks of a radio option that isn't a SegmentedControl: picked by `data-[state=checked]`, not by the caller.
export const radioItemVariants = tv({
  base: 'font-[inherit] cursor-pointer outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px] disabled:cursor-default',
  variants: {
    variant: {
      // Matchmaking's queue: a tall card, a thick accent border when picked
      card: 'box-border flex min-w-0 flex-col gap-1 rounded-[12px] px-3 py-[10px] text-left md:min-h-[84px] md:px-[14px] md:py-3 border border-line-chip bg-transparent text-ink-2 data-[state=checked]:border-2 data-[state=checked]:border-accent data-[state=checked]:bg-surface-active data-[state=checked]:text-text',
      // The minigolf course picker: a name and a line under it
      course:
        'flex flex-col items-start gap-[2px] rounded-[10px] border px-3 py-[10px] text-left border-line-2 bg-surface-2 text-text hover:bg-surface-hover data-[state=checked]:border-accent data-[state=checked]:bg-accent-tint data-[state=checked]:hover:bg-accent-tint',
      // Matchmaking's format: a one-line chip
      chip: 'flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-semibold md:px-[14px] md:text-[14px] border border-line-chip bg-transparent text-ink-2 data-[state=checked]:border-accent-line-strong data-[state=checked]:bg-surface-paused data-[state=checked]:text-text',
      // The board-view pill over the board: an icon in a round button
      pill: 'w-6 h-6 flex items-center justify-center rounded-full border-0 transition-colors bg-transparent text-white/60 data-[state=checked]:bg-white/20 data-[state=checked]:text-white',
      // The hole editor's small segments on an inset track
      segment:
        'h-8 flex-grow rounded-[8px] border-0 px-2 text-[13px] font-semibold bg-transparent text-text-muted hover:text-text data-[state=checked]:bg-surface-2 data-[state=checked]:text-text',
      // Unstyled: the option draws itself (a course's difficulty dots)
      bare: 'border-0 bg-transparent p-0',
    },
  },
  defaultVariants: { variant: 'bare' },
})
