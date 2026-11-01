<script lang="ts">
  // The X01 average class (Avg-Classes board): "Ø 70+" for a 3-dart average of 70 to 74.9, next to
  // the flag. Tinted up to 49, gradients from 50, gold from 90, holographic at 100. Hover shows the
  // exact average; nothing for an average under 20 or none.
  import { avgClass } from '$shared/avgClass.js'

  let { average, size = 'md' }: { average: number | null | undefined; size?: 'sm' | 'md' | 'lg' } = $props()

  const cls = $derived(avgClass(average ?? null))
  const label = $derived(`X01 average ${average?.toFixed(1)} · class ${cls}+`)
</script>

{#if cls !== null}
  <span class="avgb {size} t{cls}" role="img" aria-label={label} title={label}>
    <span class="ab-k" aria-hidden="true">Ø</span><span aria-hidden="true">{cls}+</span>
  </span>
{/if}

<style>
  .avgb {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    box-sizing: border-box;
    border-radius: 6px;
    font-family: var(--font-display, 'Barlow Condensed', sans-serif);
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
    cursor: default;
    -webkit-text-size-adjust: none;
  }
  .ab-k {
    font-weight: 600;
    opacity: 0.72;
  }
  .sm {
    height: 20px;
    padding: 0 6px;
    font-size: 14px;
  }
  .sm .ab-k {
    font-size: 11px;
  }
  .md {
    height: 22px;
    padding: 0 7px;
    font-size: 15px;
  }
  .md .ab-k {
    font-size: 12px;
  }
  .lg {
    height: 36px;
    padding: 0 12px;
    border-radius: 9px;
    font-size: 24px;
    gap: 5px;
  }
  .lg .ab-k {
    font-size: 17px;
  }

  /* Tinted: 20 to 49 */
  .t20 {
    --tint: #3a3e36;
    color: #a3a498;
  }
  .t25 {
    --tint: #4a4e44;
    color: #c9c9bf;
  }
  .t30 {
    --tint: #c98a52;
    color: #d9a06a;
  }
  .t35 {
    --tint: #ee8a4a;
    color: #f0955a;
  }
  .t40 {
    --tint: #4fbf6a;
    color: #6fdc8a;
  }
  .t45 {
    --tint: #a8d63a;
    color: #c6f24e;
  }
  :is(.t20, .t25, .t30, .t35, .t40, .t45) {
    background: color-mix(in srgb, var(--tint) 15%, #151713);
    border: 1px solid color-mix(in srgb, var(--tint) 50%, transparent);
  }

  /* Gradients: 50 to 89 */
  :is(.t50, .t55, .t60, .t65, .t70, .t75, .t80, .t85) {
    color: #0f100e;
  }
  .t50 {
    background: linear-gradient(135deg, #c6f24e, #4fd1c5);
  }
  .t55 {
    background: linear-gradient(135deg, #4fd1c5, #3fb6e8);
  }
  .t60 {
    background: linear-gradient(135deg, #3fb6e8, #6a8cff);
  }
  .t65 {
    background: linear-gradient(135deg, #6a8cff, #9b7bff);
  }
  .t70 {
    background: linear-gradient(135deg, #9b7bff, #d86bff);
  }
  .t75 {
    background: linear-gradient(135deg, #d86bff, #ff6b9a);
  }
  .t80 {
    background: linear-gradient(135deg, #ff6b9a, #ff8a4a);
    box-shadow: 0 0 10px rgba(255, 107, 154, 0.35);
  }
  .t85 {
    background: linear-gradient(135deg, #ff8a4a, #ffd25a);
    box-shadow: 0 0 12px rgba(255, 170, 74, 0.45);
  }

  /* Metal: 90 and 95 */
  .t90,
  .t95 {
    color: #2a1d05;
    background:
      linear-gradient(110deg, transparent 35%, rgba(255, 255, 255, 0.75) 50%, transparent 65%),
      linear-gradient(135deg, #fff1b8 0%, #f2c14e 35%, #b8862a 55%, #f5d77a 75%, #fff1b8 100%);
    background-size:
      250% 100%,
      100% 100%;
    animation: sheen 3.2s ease-in-out infinite;
    box-shadow: 0 0 0 1px rgba(255, 236, 170, 0.35);
  }
  .t95 {
    box-shadow:
      0 0 0 1px rgba(255, 236, 170, 0.5),
      0 0 14px rgba(242, 193, 78, 0.55);
  }

  /* Holo: 100 */
  .t100 {
    color: #0f100e;
    background: linear-gradient(115deg, #ff8fb1, #ffd36e, #b6f36b, #6ee7e0, #8fb4ff, #d59bff, #ff8fb1);
    background-size: 200% 100%;
    animation: holo 4s linear infinite;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.6),
      0 0 16px rgba(213, 155, 255, 0.55);
  }

  @keyframes sheen {
    0% {
      background-position:
        160% 0,
        0 0;
    }
    60%,
    100% {
      background-position:
        -60% 0,
        0 0;
    }
  }
  @keyframes holo {
    0% {
      background-position: 0% 50%;
    }
    100% {
      background-position: 200% 50%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .avgb {
      animation: none !important;
    }
  }
</style>
