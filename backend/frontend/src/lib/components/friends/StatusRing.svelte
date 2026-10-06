<script lang="ts">
  // The presence ring around an avatar wherever friends appear (User-Badge board): lime online,
  // red playing, grey offline or invisible. Not a corner dot — a ring around the whole avatar.
  // Sits absolutely inside a `relative` wrapper that's `m-1` so the ring has room outside it.
  import type { DotKind } from '$lib/friends/view'

  let { kind, class: className = '' }: { kind: DotKind; class?: string } = $props()
  const COLOR: Record<DotKind, string> = {
    online: 'border-accent',
    lobby: 'border-accent',
    playing: 'border-live',
    offline: 'border-text-dim',
  }
</script>

<span aria-hidden="true" class="absolute -inset-1 rounded-full border-[2.5px] pointer-events-none {COLOR[kind]} {className}"></span>
