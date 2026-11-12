<script lang="ts">
  // "Alpha" beside the logo: a plain badge (the Report a bug button is the way into the dialog). A PR preview shows the PR badge instead.
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { preview } from '$lib/preview'
</script>

{#if !$preview}<Badge variant="alpha">Alpha</Badge>{/if}
