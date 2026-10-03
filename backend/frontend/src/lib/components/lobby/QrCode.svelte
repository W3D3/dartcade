<script lang="ts">
  // The join link as a QR code: people point their phone's camera at it (no in-app scanner).
  import { encode } from 'uqr'

  let { text, size = 168 }: { text: string; size?: number } = $props()
  const qr = $derived(encode(text, { border: 2 }))
</script>

<svg viewBox="0 0 {qr.size} {qr.size}" width={size} height={size} role="img" aria-label="QR code of the join link"
  shape-rendering="crispEdges" class="block shrink-0 rounded-[8px] bg-[#efeee6]">
  {#each qr.data as row, y (y)}
    {#each row as on, x (x)}
      {#if on}<rect {x} {y} width="1" height="1" fill="#0f100e" />{/if}
    {/each}
  {/each}
</svg>
