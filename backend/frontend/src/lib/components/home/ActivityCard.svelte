<script lang="ts">
  // Friend activity (Home board): what your friends did lately, newest first.
  import Avatar from '$lib/components/Avatar.svelte'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { Loader } from '$lib/home/loader.svelte'
  import { activityText, relativeTime } from '$lib/home/view'

  const feed = new Loader(() => api.GET('/api/home/activity'))

  const now = new Date()
</script>

<HomeSection title="Friend activity" loading={feed.loading} error={feed.error}>
  {#if feed.data && feed.data.events.length > 0}
    <ul class="m-0 flex list-none flex-col gap-[10px] p-0">
      {#each feed.data.events as e (e.id)}
        <li class="flex items-center gap-3">
          <Avatar name={e.name} userId={e.userId} avatar={e.avatar} size={36} />
          <span class="min-w-0 flex-1 text-[14px]"><strong class="font-semibold">{e.name}</strong> {activityText(e)}</span>
          <span class="shrink-0 text-[12px] text-text-dim">{relativeTime(new Date(e.at), now)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="m-0 text-[14px] text-text-muted">No friend activity yet. 180s, big checkouts and rank-ups show up here.</p>
  {/if}
</HomeSection>
