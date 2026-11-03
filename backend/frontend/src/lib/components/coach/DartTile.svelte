<script lang="ts">
  // One dart as the coach's visit rows draw it (Coach-Leg): the tile above its class label, in a
  // fixed-width column; the tone, the grade word and the label come from visitTiles.
  import type { DartTileView, DartTone } from '$lib/coach/view'

  let { tile }: { tile: DartTileView } = $props()

  // The grade pill's tones (GRADE_PILL): weak gold, mistake red
  const TONE: Record<DartTone, string> = {
    good: 'bg-accent/10 text-accent',
    plain: 'bg-surface-paused text-ink-2',
    weak: 'bg-gold/15 text-gold',
    costly: 'bg-live/10 text-live-text',
    miss: 'bg-transparent text-live-text',
  }
</script>

<span class="inline-flex w-[72px] flex-col items-center gap-1">
  <span
    class="inline-flex items-center justify-center min-w-[46px] h-[30px] px-1.5 box-border rounded-[7px] font-display font-bold text-[18px] {TONE[
      tile.tone
    ]} {tile.offBoard ? 'border-[1.5px] border-dashed border-danger-line' : ''}"
    >{tile.name}{#if tile.word}<span class="sr-only">, {tile.word}</span>{/if}</span
  >
  <span class="text-center text-[11px] leading-[1.25] text-text-muted">{tile.label}</span>
</span>
