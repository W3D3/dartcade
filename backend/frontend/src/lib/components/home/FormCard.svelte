<script lang="ts">
  // Your form (Home board): your X01 numbers of the last 30 days, with how the average moved
  // against the 30 days before, and how many games you played in all modes.
  import { ArrowDown, ArrowUp } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import AverageSpark from './AverageSpark.svelte'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { Loader } from '$lib/home/loader.svelte'
  import { formForm } from '$lib/home/view'

  const stats = new Loader(() => api.GET('/api/games/stats', { params: { query: { days: 30 } } }))

  const form = $derived(stats.data ? formForm(stats.data) : null)
  const tiles = $derived(
    form
      ? [
          { label: '3-dart avg', value: form.avg, note: null },
          { label: 'Checkout', value: form.checkout, note: 'of tries' },
          { label: 'Best checkout', value: form.bestCheckout, note: null },
          { label: 'Games', value: form.games, note: 'last 30 days' },
        ]
      : [],
  )
</script>

<HomeSection title="Your form" link={{ label: 'Full stats', href: '#/profile' }} loading={stats.loading} error={stats.error}>
  {#if $currentUser}
    <div class="flex items-center gap-3">
      <Avatar name={$currentUser.name} userId={$currentUser.id} avatar={$currentUser.avatar} size={40} tone="accent" />
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-[15px] font-semibold">{$currentUser.name}</span>
        <span class="text-[13px] text-text-muted">Last 30 days</span>
      </span>
    </div>
  {/if}
  <div class="grid grid-cols-2 gap-[10px] md:grid-cols-4">
    {#each tiles as tile (tile.label)}
      <div class="flex min-w-0 flex-col gap-1 rounded-[10px] border border-line bg-surface-1 px-3 py-[10px]">
        <span class="truncate text-[11px] uppercase tracking-[0.1em] text-text-muted">{tile.label}</span>
        <span class="flex items-baseline gap-2 whitespace-nowrap">
          <span class="font-display text-[34px] font-bold leading-none">{tile.value}</span>
          {#if tile.label === '3-dart avg' && form?.trend && form.trend.dir !== 'flat'}
            <span class="inline-flex items-center text-[12px] font-semibold {form.trend.dir === 'up' ? 'text-accent' : 'text-live-text'}">
              {#if form.trend.dir === 'up'}<ArrowUp size={12} aria-label="Up" />{:else}<ArrowDown size={12} aria-label="Down" />{/if}
              {form.trend.delta.toFixed(1)}
            </span>
          {/if}
        </span>
        {#if tile.note}<span class="text-[12px] text-text-dim">{tile.note}</span>{/if}
      </div>
    {/each}
  </div>
  <AverageSpark days={form?.byDay ?? []} />
</HomeSection>
