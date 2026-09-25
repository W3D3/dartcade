<script lang="ts">
  export let darts: Array<{
    segment: { name: string; number: number; bed: string; multiplier: number }
    score: number
  }> = []

  $: visitTotal = darts.reduce((s, d) => s + d.score, 0)

  function dartLabel(d: typeof darts[0]): string {
    return d.segment.name
  }

  const dartPath = 'M0,0 L2,12 L0,28 L-2,12 Z'
</script>

<div class="flex items-center justify-between px-6 py-3 border-b"
  style="background: #111d2e; border-color: rgba(255,255,255,0.06);">

  <div class="flex items-center gap-10">
    {#each Array(3) as _, i}
      {@const dart = darts[i]}
      <div class="flex items-center gap-2 min-w-[64px]">
        <svg width="12" height="28" viewBox="-3 -2 6 32"
          class="{dart ? 'text-white' : 'text-gray-700'} fill-current">
          <path d={dartPath} />
        </svg>
        <span class="font-mono text-sm tabular-nums w-8
          {dart ? 'text-white' : 'text-gray-700'}">
          {dart ? dartLabel(dart) : '—'}
        </span>
        {#if dart && dart.score > 0}
          <span class="text-xs text-blue-400 font-semibold">{dart.score}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex items-center gap-3">
    <span class="text-2xl font-bold tabular-nums"
      class:text-white={darts.length > 0}
      class:text-gray-700={darts.length === 0}>
      {visitTotal}
    </span>
    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
      style="background: rgba(255,255,255,0.08); color: #94a3b8;">
      👤
    </div>
  </div>
</div>
