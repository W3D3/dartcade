<script lang="ts">
  // The status dot wherever friends appear (User-Badge legend): online lime, in a lobby lime with an
  // inner ring, playing red, offline or invisible a hollow grey ring.
  import type { DotKind } from '$lib/friends/view'

  let { kind, size = 12, class: className = '' }: { kind: DotKind; size?: number; class?: string } = $props()
  const LOOK: Record<DotKind, string> = {
    online: 'bg-accent border-2 border-bg',
    lobby: 'bg-accent border-2 border-bg [box-shadow:inset_0_0_0_2px_var(--color-accent-tint)]',
    playing: 'bg-live border-2 border-bg',
    offline: 'bg-bg border-2 border-text-dim',
  }
</script>

<span aria-hidden="true" style="width: {size}px; height: {size}px" class="box-border rounded-full shrink-0 {LOOK[kind]} {className}"></span>
