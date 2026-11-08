<script lang="ts">
  // Placeholder for a coach route while its chunk downloads (App.svelte's `loading`, `page` from its
  // `loadingParams`): the page's own skeleton in the page's frame, instead of RouteLoading's line.
  import { ChevronLeft } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ListSkeleton from '$lib/components/coach/ListSkeleton.svelte'
  import LegSkeleton from '$lib/components/coach/LegSkeleton.svelte'
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { params }: { params: { page: 'list' | 'leg' | 'checks' | 'sandbox' } } = $props()
</script>

{#snippet breadcrumb()}
  <a href="#/coach" class="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold no-underline"
    ><ChevronLeft size={16} />Review</a
  >
{/snippet}

<Layout title={params.page === 'sandbox' ? 'Coach sandbox' : 'Coach'}>
  <main class="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto px-4 py-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    {#if params.page === 'list'}
      <header class="flex flex-col gap-1.5">
        <h1 class="hidden font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em] md:block">Coach</h1>
        <p class="text-[15px] text-text-muted">A second look at any of your last 50 X01 legs.</p>
      </header>
      <ListSkeleton />
    {:else if params.page === 'leg'}
      <LegSkeleton {breadcrumb} />
    {:else}
      <div aria-busy="true" class="flex flex-col gap-4 md:gap-[22px]">
        <p role="status" class="sr-only">Loading…</p>
        <Skeleton class="h-[34px] w-72 max-w-full md:h-12 md:w-[28rem]" />
        <Skeleton class="h-4 w-full max-w-[900px]" />
        <Skeleton class="h-64 w-full rounded-[18px]" />
      </div>
    {/if}
  </main>
</Layout>
