<script lang="ts">
  // Beside the logo on a PR preview deployment: which pull request this is, linking to it. Nothing in production.
  import { preview } from '$lib/preview'
</script>

{#if $preview}
  <a
    href={$preview.url}
    target="_blank"
    rel="noopener noreferrer"
    title="Preview of pull request #{$preview.pr} (opens GitHub)"
    class="h-[18px] px-[6px] shrink-0 inline-flex items-center rounded-full border border-warn-line bg-warn-soft text-warn text-[10px] font-bold tracking-[0.04em] whitespace-nowrap no-underline hover:border-warn"
    >PR #{$preview.pr}</a
  >
{/if}
