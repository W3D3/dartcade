<script lang="ts">
  // The round "XP" mark after an XP amount (Progress board). `inverse` is for a lime background:
  // dark with a lime label.
  let { size = 20, inverse = false }: { size?: number; inverse?: boolean } = $props()
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none tracking-normal
         {inverse
    ? 'bg-accent-fg text-accent shadow-[inset_0_0_0_1.5px_#c6f24e33]'
    : 'bg-accent text-accent-fg shadow-[inset_0_0_0_1.5px_#0f100e33]'}"
  style="width: {size}px; height: {size}px; font-size: {size / 2}px">XP</span
>
