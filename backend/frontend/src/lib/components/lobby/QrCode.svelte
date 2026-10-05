<script lang="ts">
  // The join link as a QR code: people point their phone's camera at it (no in-app scanner).
  import { encode } from 'uqr'

  // `size` sets the intrinsic (attribute) width/height; `class` can override the rendered
  // size with CSS (e.g. to clamp it to the viewport on phones) while keeping the 1:1 aspect
  // ratio from the viewBox. `border` in encode() is the quiet zone (in modules) phones need
  // to focus on the code; keep it even when the code is shrunk to fit a small screen.
  let { text, size = 168, class: className = '' }: { text: string; size?: number; class?: string } = $props()
  const qr = $derived(encode(text, { border: 2 }))
</script>

<svg
  viewBox="0 0 {qr.size} {qr.size}"
  width={size}
  height={size}
  role="img"
  aria-label="QR code of the join link"
  shape-rendering="crispEdges"
  class="block shrink-0 rounded-[8px] bg-[#efeee6] {className}"
>
  {#each qr.data as row, y (y)}
    {#each row as on, x (x)}
      {#if on}<rect {x} {y} width="1" height="1" fill="#0f100e" />{/if}
    {/each}
  {/each}
</svg>
