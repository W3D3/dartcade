<script lang="ts">
  // One dart as the coach's visit rows draw it (Coach-Leg): the tile above its class label, in a
  // fixed-width column; the tone and the label come from visitTiles.
  import type { DartTone } from '$lib/coach/view'

  let { name, tone, label }: { name: string; tone: DartTone; label: string } = $props()

  const TONE: Record<DartTone, string> = {
    hit: 'bg-accent/10 text-accent',
    single: 'bg-surface-paused text-ink-2',
    missed: 'bg-live/10 text-live-text',
    miss: 'bg-transparent text-live-text border-[1.5px] border-dashed border-danger-line',
  }
</script>

<span class="inline-flex w-[72px] flex-col items-center gap-1">
  <span
    class="inline-flex items-center justify-center min-w-[46px] h-[30px] px-1.5 box-border rounded-[7px] font-display font-bold text-[18px] {TONE[
      tone
    ]}">{name}</span
  >
  <span class="text-center text-[11px] leading-[1.25] text-text-muted">{label}</span>
</span>
