<script lang="ts">
  // A refusal or failure, in red, read out by screen readers when it appears.
  import type { Snippet } from 'svelte'
  import { cn } from '$lib/utils.js'

  let { children, class: className = '' }: { children: Snippet; class?: string } = $props()
</script>

<p role="alert" class={cn('m-0 text-[14px] text-live-text', className)}>{@render children()}</p>
