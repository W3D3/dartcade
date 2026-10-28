// Classes shared by the date picker and the date range picker: the field, its segments, and the calendar popover.
export const field =
  'flex h-11 items-center gap-2 rounded-[10px] border border-line-3 px-3 text-[14px] text-text focus-within:outline-2 focus-within:outline-accent'
export const segment = 'rounded-[4px] px-[2px] outline-none focus:bg-accent focus:text-accent-fg data-[placeholder]:text-text-dim'
export const day =
  'flex size-9 items-center justify-center rounded-[8px] text-[14px] text-text outline-none cursor-pointer hover:bg-surface-key ' +
  'data-[today]:border data-[today]:border-line-strong data-[selected]:bg-accent data-[selected]:text-accent-fg ' +
  'data-[outside-month]:pointer-events-none data-[outside-month]:opacity-30 data-[disabled]:opacity-30 data-[unavailable]:opacity-30'
/** A range: its ends filled, the days between (and the hovered stretch while picking) tinted. `!` beats data-[selected]. */
export const rangeDay =
  day +
  ' data-[range-middle]:rounded-none data-[range-middle]:bg-accent/15! data-[range-middle]:text-text!' +
  ' data-[highlighted]:rounded-none data-[highlighted]:bg-accent/15'
export const nav =
  'flex size-8 items-center justify-center rounded-[8px] border-0 bg-transparent text-text-muted cursor-pointer hover:bg-surface-key'
export const content = 'z-[60] rounded-[12px] border border-line-popover bg-surface-inset p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)]'
