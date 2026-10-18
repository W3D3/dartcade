<script lang="ts">
  import { ChevronRight } from '@lucide/svelte'
  import type { BreadcrumbItem } from './types.js'

  let { items }: { items: BreadcrumbItem[] } = $props()
</script>

<nav aria-label="Breadcrumb" class="min-w-0">
  <ol class="m-0 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-[2px] p-0 text-[13px] leading-none">
    {#each items as item, i (i)}
      {#if i > 0}
        <li role="presentation" aria-hidden="true" class="flex shrink-0 items-center text-text-dim">
          <ChevronRight size={14} />
        </li>
      {/if}
      <li class="flex min-w-0 max-w-[260px] items-center">
        {#if i === items.length - 1}
          <span aria-current="page" class="truncate text-text font-medium">{item.label}</span>
        {:else if item.href || item.onclick}
          <a href={item.href ?? '#'} onclick={item.onclick} class="truncate text-text-muted no-underline hover:text-text">{item.label}</a>
        {:else}
          <span class="truncate text-text-muted">{item.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
