<script lang="ts">
  // The badges' gradients and clip paths (Badges board), inlined once for the whole app (App.svelte):
  // Badge draws with `url(#bm3)` and the like, which only finds defs in the same document.
  import { BADGE_DEFS } from '$lib/achievements/defs'
</script>

<svg width="0" height="0" style="position:absolute" aria-hidden="true" data-screenshot-omit>
  <defs>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own static asset -->
    {@html BADGE_DEFS}
  </defs>
</svg>
