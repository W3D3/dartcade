<script lang="ts">
  // One dart as the coach's visit rows draw it (Coach-Leg); the tone comes from visitTiles.
  import type { DartTone } from '$lib/coach/view'

  let { name, tone }: { name: string; tone: DartTone } = $props()

  const TONE: Record<DartTone, string> = {
    hit: 'bg-accent/10 text-accent',
    single: 'bg-surface-paused text-ink-2',
    missed: 'bg-live/10 text-live-text',
    miss: 'bg-transparent text-live-text border-[1.5px] border-dashed border-danger-line',
  }
</script>

<span
  class="inline-flex items-center justify-center min-w-[46px] h-[30px] px-1.5 box-border rounded-[7px] font-display font-bold text-[18px] {TONE[
    tone
  ]}">{name}</span
>
