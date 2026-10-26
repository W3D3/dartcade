<script lang="ts">
  // "Alpha" beside the logo. Signed in (interactive) on a server that takes reports, it opens the bug report dialog.
  import { authInfo } from '$lib/authInfo'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { openFeedback } from '$lib/feedback/report'

  let { interactive = false }: { interactive?: boolean } = $props()
</script>

{#if interactive && $authInfo.feedback}
  <button
    type="button"
    onclick={() => void openFeedback()}
    title="Report a bug or give feedback"
    aria-label="Alpha: report a bug or give feedback"
    class="shrink-0 inline-flex rounded-full cursor-pointer bg-transparent border-0 p-0 hover:brightness-125
           focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px]"
  >
    <Badge variant="alpha">Alpha</Badge>
  </button>
{:else}
  <Badge variant="alpha">Alpha</Badge>
{/if}
