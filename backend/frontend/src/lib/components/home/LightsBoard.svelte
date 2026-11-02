<script lang="ts">
  // Featured banner art for the board lights: the match screen's board ringed by an LED strip in the
  // accent colour. The glow breathes and a bright run of LEDs chases round; both stand still under
  // prefers-reduced-motion. Pure SVG/CSS, no timers.
  import DartBoard from '$lib/components/DartBoard.svelte'

  const LEDS = 48
  const RADIUS = 46
  const leds = Array.from({ length: LEDS }, (_, i) => {
    const a = (i / LEDS) * 2 * Math.PI
    return { x: 50 + RADIUS * Math.sin(a), y: 50 - RADIUS * Math.cos(a) }
  })
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
</script>

<div class="lights-board relative aspect-square h-full max-w-full" aria-hidden="true">
  <div class="absolute inset-[11%]"><DartBoard /></div>
  <svg viewBox="0 0 100 100" class="absolute inset-0 size-full overflow-visible">
    <circle class="glow" cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--color-accent)" stroke-width="5" />
    {#each leds as led, i (i)}
      <circle cx={led.x} cy={led.y} r="1.7" fill="var(--color-accent-line-strong)" />
    {/each}
    <g class="runner">
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke="var(--color-accent)"
        stroke-width="3.4"
        stroke-linecap="round"
        stroke-dasharray="{CIRCUMFERENCE / 6} {CIRCUMFERENCE}"
      />
    </g>
  </svg>
</div>

<style>
  .glow {
    opacity: 0.35;
    filter: blur(3px);
    animation: breathe 3.2s ease-in-out infinite;
  }
  .runner {
    transform-origin: 50px 50px;
    animation: chase 6s linear infinite;
    filter: drop-shadow(0 0 2px var(--color-accent));
  }
  @keyframes breathe {
    50% {
      opacity: 0.7;
    }
  }
  @keyframes chase {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .glow,
    .runner {
      animation: none;
    }
    .glow {
      opacity: 0.55;
    }
  }
</style>
