<script lang="ts">
  // A grade scale as a bar (VisitNumbers): its classes as coloured stretches, the bounds labelled
  // (alternately above and below so near ones don't collide) and a marker at the visit's points.
  // Hidden from screen readers: the working's text says it all.
  import type { GradeScale } from '$lib/coach/numbers'
  import { GRADE_STYLE } from '$lib/coach/tone'

  let { scale }: { scale: GradeScale } = $props()
</script>

<div aria-hidden="true" class="relative mx-3 mt-5 mb-6 h-2.5">
  {#each scale.bands as b (b.grade)}
    <span class="absolute inset-y-0 {GRADE_STYLE[b.grade].fill}" style:left="{b.left}%" style:width="{b.width}%"></span>
  {/each}
  {#each scale.ticks as t, i (t.left)}
    <span
      class="absolute -translate-x-1/2 text-[11px] leading-none tabular-nums {i % 2 ? 'top-[calc(100%+4px)]' : 'bottom-[calc(100%+4px)]'}"
      style:left="{t.left}%">{t.label}</span
    >
  {/each}
  <span class="absolute -inset-y-1.5 w-[3px] -translate-x-1/2 rounded-full bg-text ring-2 ring-bg" style:left="{scale.marker}%"></span>
</div>
