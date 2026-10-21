<script lang="ts">
  // A dart, Lucide-style (`size`, stroked in `currentColor`): the Dart avatar picture.
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
>
  <path d="M4 20 15 9" /><path d="m15 9 1-5 4 4-5 1z" /><path d="m4 20 3-1-2-2z" />
</svg>
