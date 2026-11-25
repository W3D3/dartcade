<!-- A page's body while its data loads: one centred spinner. -->
<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte'
</script>

<div class="flex justify-center py-10 text-text-muted">
  <LoaderCircle class="animate-spin motion-reduce:animate-skeleton-soft" size={24} aria-label="Loading" />
</div>
