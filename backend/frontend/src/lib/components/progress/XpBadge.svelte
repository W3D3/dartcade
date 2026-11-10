<script lang="ts">
  // The round "XP" mark after an XP amount (Progress board). `inverse` is for a lime background:
  // dark with a lime label.
  let { size = 20, inverse = false }: { size?: number; inverse?: boolean } = $props()
</script>

<span
  class="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none tracking-normal
         {inverse
    ? 'bg-accent-fg text-accent inset-ring-[1.5px] inset-ring-accent/20'
    : 'bg-accent text-accent-fg inset-ring-[1.5px] inset-ring-bg/20'}"
  style="width: {size}px; height: {size}px; font-size: {size / 2}px">XP</span
>
