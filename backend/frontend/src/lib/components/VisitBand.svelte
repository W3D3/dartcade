<script lang="ts">
  // The visit sum under the board (or a compact tile beside the slots), with the
  // VisitFX celebrations: ton plus, maximum, and a tick for a big dart.
  import { shouldReplay, type BandData } from '$lib/visitBand.js'

  let { band, compact = false }: { band: BandData; compact?: boolean } = $props()

  const tone = $derived(band.bust ? 'bust' : band.fx)
  // Re-mount (and so replay the animation) only when a celebrating sum goes up:
  // not on load, not when a dart is undone
  let replays = $state(0)
  let lastSum: number | null = null
  $effect(() => {
    if (shouldReplay(lastSum, band)) replays++
    lastSum = Number(band.sum.replace('+', ''))
  })

  // 180: confetti bursts from the band across almost the whole screen
  let bandEl: HTMLDivElement | undefined = $state()
  let origin = $state({ x: 0, y: 0 })
  $effect(() => {
    if (band.fx !== 'max' || !bandEl) return
    const r = bandEl.getBoundingClientRect()
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const CONFETTI = ['#e9dfc4', '#c6f24e', '#d23b36', '#1e7a4f', '#dcff7a', '#efeee6']
  // Deterministic spread: angles all round, distances out to ~the screen edges (in vw/vh)
  const confetti = Array.from({ length: 150 }, (_, i) => {
    const a = i * 2.399963 // golden angle
    const d = 0.35 + ((i * 37) % 65) / 100
    return {
      c: CONFETTI[i % CONFETTI.length],
      w: 6 + ((i * 7) % 6), h: 10 + ((i * 5) % 9),
      x: Math.round(Math.cos(a) * d * 60), // vw
      y: Math.round(Math.sin(a) * d * 70 - 12), // vh, slightly upwards
      r: ((i * 97) % 1080) - 540,
      delay: (i % 10) * 25,
    }
  })

  const box = $derived(
    tone === 'max' ? 'bg-accent border-2 border-accent text-accent-fg fx-max'
    : tone === 'ton' ? 'bg-[#1f2618] border-2 border-accent fx-ton'
    : tone === 'bust' ? 'bg-surface-panel border border-danger-line'
    : 'bg-surface-panel border border-line-2')
  const eyebrowColor = $derived(tone === 'max' ? '' : tone === 'ton' ? 'text-accent font-bold' : tone === 'bust' ? 'text-danger-text font-bold' : 'text-text-muted')
  const sumColor = $derived(tone === 'ton' ? 'text-accent' : tone === 'bust' ? 'text-danger-text line-through' : '')
  const quiet = $derived(tone === 'max' ? '' : 'text-text-dim')
  const afterColor = $derived(tone === 'max' ? '' : 'text-ink-3')
</script>

<span class="sr-only" role="status" aria-live="polite">{band.eyebrow}: {band.sum}. {band.afterLabel} {band.after}</span>

{#key replays}
  {#if compact}
    <div bind:this={bandEl} class="relative h-[min(124px,14vh)] box-border px-[18px] py-3 rounded-[14px] flex flex-col justify-between {box}">
      <span class="flex justify-between gap-2 text-[13px]">
        <span class={eyebrowColor}>{band.eyebrow}</span><span class={quiet}>{band.progressShort}</span>
      </span>
      <span class="font-display font-bold text-[80px] leading-[0.85] tabular-nums self-center {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex items-baseline justify-between gap-2 text-[13px]">
        <span class={quiet}>{band.afterLabel}</span>
        <span class="font-display font-bold text-[24px] leading-none {afterColor}">{band.after}</span>
      </span>
    </div>
  {:else}
    <div bind:this={bandEl} class="relative grid grid-cols-[1fr_auto_1fr] items-center gap-5 px-[18px] py-[10px] rounded-[14px] {box}">
      <span class="flex flex-col items-end gap-[2px] text-right">
        <span class="text-[12px] uppercase tracking-[0.1em] {eyebrowColor}">{band.eyebrow}</span>
        <span class="text-[13px] {quiet}">{band.progress}</span>
      </span>
      <span class="sum font-display font-bold text-[min(96px,11vh)] leading-[0.85] tabular-nums {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex flex-col gap-[2px]">
        <span class="text-[12px] uppercase tracking-[0.1em] {quiet}">{band.afterLabel}</span>
        <span class="font-display font-bold text-[30px] leading-none {afterColor}">{band.after}</span>
      </span>
    </div>
  {/if}
  <!-- Outside the band: its transform animation would trap a fixed layer inside it -->
  {#if tone === 'max'}{@render burst()}{/if}
{/key}

{#snippet burst()}
  <span class="fixed inset-0 z-[60] pointer-events-none overflow-hidden" aria-hidden="true">
    {#each confetti as p}
      <span class="confetti"
        style="left:{origin.x}px;top:{origin.y}px;--c:{p.c};--w:{p.w}px;--h:{p.h}px;--x:{p.x}vw;--y:{p.y}vh;--r:{p.r}deg;animation-delay:{p.delay}ms"></span>
    {/each}
  </span>
{/snippet}

<style>
  .fx-ton { animation: dc-ton 1.6s ease-in-out 1; }
  .fx-ton .sum { animation: dc-num 1.6s ease-in-out 1; }
  .fx-max { animation: dc-max 2.6s cubic-bezier(.2, .8, .2, 1) 1; }
  .fx-tick { animation: dc-tick 0.9s ease-out 1; }
  .confetti {
    position: absolute;
    width: var(--w); height: var(--h); background: var(--c); border-radius: 2px; opacity: 0;
    animation: dc-conf 3.2s cubic-bezier(.15, .7, .3, 1) 1 forwards;
  }
  @keyframes dc-ton {
    0%, 100% { box-shadow: 0 0 0 0 rgba(198, 242, 78, 0); }
    50% { box-shadow: 0 0 0 8px rgba(198, 242, 78, .16), 0 0 36px rgba(198, 242, 78, .25); border-color: #dcff7a; }
  }
  @keyframes dc-num { 50% { transform: scale(1.05); } }
  @keyframes dc-max {
    0% { transform: scale(1); }
    20% { transform: scale(1.07); box-shadow: 0 0 48px rgba(198, 242, 78, .55); }
    45% { transform: scale(.99); }
    70% { transform: scale(1.04); }
    100% { transform: scale(1); box-shadow: none; }
  }
  @keyframes dc-tick { 12% { transform: scale(1.12); } 100% { transform: scale(1); } }
  @keyframes dc-conf {
    0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
    75% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 18vh)) rotate(var(--r)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-ton, .fx-ton .sum, .fx-max, .fx-tick { animation: none; }
    .confetti { display: none; }
  }
</style>
