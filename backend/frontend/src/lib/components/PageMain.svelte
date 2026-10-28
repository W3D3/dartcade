<!-- A page's scrolling body under the Layout's header: the admin and settings pages' padding and rhythm. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-[22px] overflow-y-auto box-border p-4 md:p-[34px_32px] xl:p-[34px_44px]">
  {@render children()}
</main>
