<script lang="ts">
  // The visit sum under the board (or a compact tile beside the slots), with the
  // VisitFX celebrations: ton plus, maximum, and a tick for a big dart.
  import type { BandData } from '$lib/visitBand.js'

  let { band, compact = false }: { band: BandData; compact?: boolean } = $props()

  const tone = $derived(band.bust ? 'bust' : band.fx)
  // Re-mount on every new celebrating sum so each animation plays once when the dart lands
  const replayKey = $derived(band.fx !== 'none' || band.bigDart ? band.sum : 'calm')

  const CONFETTI = ['#e9dfc4', '#c6f24e', '#d23b36', '#1e7a4f', '#dcff7a', '#efeee6']
  const confetti = Array.from({ length: 30 }, (_, i) => ({
    c: CONFETTI[i % CONFETTI.length],
    w: 6 + ((i * 7) % 5), h: 10 + ((i * 5) % 7),
    x: Math.round(Math.cos(i * 2.4) * (120 + ((i * 37) % 160))),
    y: Math.round(-60 - ((i * 53) % 180)),
    r: ((i * 97) % 720) - 360,
  }))

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

{#key replayKey}
  {#if compact}
    <div role="status" class="relative h-[min(124px,14vh)] box-border px-[18px] py-3 rounded-[14px] flex flex-col justify-between {box}">
      <span class="flex justify-between gap-2 text-[13px]">
        <span class={eyebrowColor}>{band.eyebrow}</span><span class={quiet}>{band.progressShort}</span>
      </span>
      <span class="font-display font-bold text-[80px] leading-[0.85] tabular-nums self-center {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex items-baseline justify-between gap-2 text-[13px]">
        <span class={quiet}>{band.afterLabel}</span>
        <span class="font-display font-bold text-[24px] leading-none {afterColor}">{band.after}</span>
      </span>
      {#if tone === 'max'}{@render burst()}{/if}
    </div>
  {:else}
    <div role="status" class="relative grid grid-cols-[1fr_auto_1fr] items-center gap-5 px-[18px] py-[10px] rounded-[14px] {box}">
      <span class="flex flex-col items-end gap-[2px] text-right">
        <span class="text-[12px] uppercase tracking-[0.1em] {eyebrowColor}">{band.eyebrow}</span>
        <span class="text-[13px] {quiet}">{band.progress}</span>
      </span>
      <span class="sum font-display font-bold text-[min(96px,11vh)] leading-[0.85] tabular-nums {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex flex-col gap-[2px]">
        <span class="text-[12px] uppercase tracking-[0.1em] {quiet}">{band.afterLabel}</span>
        <span class="font-display font-bold text-[30px] leading-none {afterColor}">{band.after}</span>
      </span>
      {#if tone === 'max'}{@render burst()}{/if}
    </div>
  {/if}
{/key}

{#snippet burst()}
  <span class="absolute inset-0 pointer-events-none" aria-hidden="true">
    {#each confetti as p}
      <span class="confetti" style="--c:{p.c};--w:{p.w}px;--h:{p.h}px;--x:{p.x}px;--y:{p.y}px;--r:{p.r}deg"></span>
    {/each}
  </span>
{/snippet}

<style>
  .fx-ton { animation: dc-ton 1.6s ease-in-out 1; }
  .fx-ton .sum { animation: dc-num 1.6s ease-in-out 1; }
  .fx-max { animation: dc-max 2.6s cubic-bezier(.2, .8, .2, 1) 1; }
  .fx-tick { animation: dc-tick 0.9s ease-out 1; }
  .confetti {
    position: absolute; left: 50%; top: 50%;
    width: var(--w); height: var(--h); background: var(--c); border-radius: 2px; opacity: 0;
    animation: dc-conf 2.6s cubic-bezier(.2, .8, .2, 1) 1 forwards;
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
    100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 120px)) rotate(var(--r)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-ton, .fx-ton .sum, .fx-max, .fx-tick { animation: none; }
    .confetti { display: none; }
  }
</style>
