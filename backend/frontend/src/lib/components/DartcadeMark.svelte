<script lang="ts">
  // The Dartcade mark (the favicon's bullseye rings) as an avatar icon: a Lucide-style component
  // (`size`, stroked in `currentColor`) so it drops into Avatar.svelte the same way a Lucide icon
  // would. The default avatar for every new account, until XP progression unlocks other icons.
  let { size = 24 }: { size?: number | string } = $props()
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="lucide lucide-dartcade-mark"
>
  <circle cx="12" cy="12" r="9" />
  <circle cx="12" cy="12" r="5" />
  <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
</svg>
