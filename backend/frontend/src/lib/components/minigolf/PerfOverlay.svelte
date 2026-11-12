<!--
  The 3D view's frame-time overlay (?perf=1): the last 2 s of frames, the canvas, the tier, the GPU.
-->
<script lang="ts">
  import type { FrameSample, PerfSummary } from '$lib/minigolf/perf'

  let { summary, last, gl }: { summary: PerfSummary; last: FrameSample; gl: string } = $props()
</script>

<div
  class="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 type-mono-sm leading-snug text-white"
  data-testid="perf-overlay"
>
  <div>{summary.fps} fps · 1% low {summary.low1Fps}</div>
  <div>frame p50 {summary.frameMs.p50} · p95 {summary.frameMs.p95} ms</div>
  <div>
    cpu p50 {summary.cpuMs.p50} ms{#if summary.gpuMs}
      · gpu p50 {summary.gpuMs.p50} ms{/if}
  </div>
  <div>{summary.calls} draws · {summary.triangles} tris</div>
  <div>{last.canvas[0]}×{last.canvas[1]} · {last.tier}{last.scale < 1 ? ` at ${Math.round(last.scale * 100)}%` : ''}</div>
  <div>{gl}</div>
</div>
