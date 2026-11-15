<script lang="ts">
  // The root of a page outside Layout (sign-in, the legal pages, an invite link). The body is
  // overflow hidden and the signed-in shell scrolls inside itself, so such a page has to scroll
  // inside its own root or a page taller than the screen can't be scrolled.
  import type { Snippet } from 'svelte'

  let { class: className = '', children }: { class?: string; children: Snippet } = $props()
</script>

<div class="h-dvh overflow-y-auto {className}">{@render children()}</div>
