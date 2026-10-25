<script lang="ts">
  // The avatar finishes' art (shared/avatarFinishes.ts), inlined once for the whole app (App.svelte):
  // FinishPicture draws a layer with `<use href="#finish-bg-<id>">` / `#finish-fg-<id>`, which only
  // finds symbols in the same document. The sprite hides itself (0×0, absolutely positioned).
  import sprite from '$lib/assets/finishes.svg?raw'
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own static asset -->
{@html sprite}
