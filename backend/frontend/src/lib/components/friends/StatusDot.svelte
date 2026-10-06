<script lang="ts">
  // The small standalone status swatch (the status picker on the User-Badge board): a hollow
  // ring, not a filled dot — lime online, grey offline/invisible. For the ring around an avatar,
  // use StatusRing instead.
  import type { DotKind } from '$lib/friends/view'

  let { kind, size = 12, class: className = '' }: { kind: DotKind; size?: number; class?: string } = $props()
  const COLOR: Record<DotKind, string> = {
    online: 'border-accent',
    lobby: 'border-accent',
    playing: 'border-live',
    offline: 'border-text-dim',
  }
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px; border-width: 3px"
  class="box-border rounded-full shrink-0 {COLOR[kind]} {className}"
></span>
