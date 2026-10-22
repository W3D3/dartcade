<script lang="ts">
  // The frame perk round a profile picture: a metallic ring a step outside the online-status ring
  // (StatusRing sits 4 px out; this one 5–9 px), so both show. Like StatusRing it sits absolutely
  // in the picture's `relative` wrapper. Nothing for "No frame".
  import { frameOf } from '$lib/progress/look'

  let { frame }: { frame: string } = $props()
  const f = $derived(frameOf(frame))
</script>

{#if f}
  <span
    aria-hidden="true"
    class="absolute -inset-[9px] rounded-full pointer-events-none {f.spin ? 'cos-spin' : ''}"
    style="background: {f.ring}; mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px))"
  ></span>
{/if}
