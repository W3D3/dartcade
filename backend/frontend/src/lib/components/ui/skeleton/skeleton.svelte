<!-- A pulsing block standing in for content that is still loading; `class` gives it the content's
     size. Hidden from screen readers: the region it fills says it's loading (aria-busy, a status). -->
<script lang="ts">
  import { cn } from '$lib/utils.js'

  let { class: className = '' }: { class?: string } = $props()
</script>

<span aria-hidden="true" class={cn('block animate-pulse rounded-sm bg-surface-key motion-reduce:animate-none', className)}></span>
