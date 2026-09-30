<script lang="ts">
  // The Dartcade logo: three lime rings.
  let { size }: { size: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="16" r="14" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2.5" fill="#c6f24e"/>
</svg>
