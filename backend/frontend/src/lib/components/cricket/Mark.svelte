<!--
  One cell's Cricket mark as strokes: / for one, X for two, the X in a circle for three. Only the
  strokes a dart just added (past `from`) draw in, one after another: the slash and the X's second
  diagonal ~320 ms, the circle ~400 ms from the top. Reduced motion shows them at once.
-->
<script lang="ts">
  import { markGlyph } from '$lib/cricket/view'

  let { marks, from = marks, class: cls = '' }: { marks: number; from?: number; class?: string } = $props()

  // The nth stroke draws in when the dart added it, after the strokes it added before it
  const draw = (n: number) => (from < n ? 'draw' : '')
  const delay = (n: number) => (from < n - 1 ? `${(n - 1 - from) * 340}ms` : null)
</script>

<svg
  viewBox="0 0 100 100"
  aria-hidden="true"
  data-mark={markGlyph(marks)}
  class="block shrink-0 {cls}"
  fill="none"
  stroke="currentColor"
  stroke-width="10"
  stroke-linecap="round"
>
  {#if marks >= 1}<path class={draw(1)} d="M27 73L73 27" pathLength="1" />{/if}
  {#if marks >= 2}<path class={draw(2)} style:animation-delay={delay(2)} d="M27 27L73 73" pathLength="1" />{/if}
  {#if marks >= 3}<circle
      class="ring {draw(3)}"
      style:animation-delay={delay(3)}
      cx="50"
      cy="50"
      r="42"
      pathLength="1"
      stroke-width="8"
      transform="rotate(-90 50 50)"
    />{/if}
</svg>

<style>
  /* Dash and gap longer than the stroke: the offset slides the dash in from its start */
  .draw {
    stroke-dasharray: 1 2;
    animation: draw 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .ring.draw {
    animation-duration: 400ms;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1.05;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .draw {
      animation: none;
    }
  }
</style>
