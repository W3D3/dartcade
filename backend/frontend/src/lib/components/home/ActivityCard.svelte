<script lang="ts">
  // Friend activity (Home board): what your friends did lately, newest first. A friend who is playing
  // right now gets a Watch (behind watch.enabled).
  import { Eye } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { flag } from '$lib/flags'
  import { watchPath } from '$lib/friends/view'
  import { me } from '$lib/lobby/sockets'
  import Avatar from '$lib/components/Avatar.svelte'
  import HomeSection from './HomeSection.svelte'
  import { api } from '$lib/api'
  import { Loader } from '$lib/home/loader.svelte'
  import { activityText, relativeTime } from '$lib/home/view'

  const feed = new Loader(() => api.GET('/api/home/activity'))

  const now = new Date()
  const watchOn = flag('watch.enabled')
  const watchFor = (userId: string) => {
    const f = $me?.friends?.friends.find(x => x.id === userId)
    return f ? watchPath(f.status, $watchOn) : null
  }
</script>

<HomeSection title="Friend activity" loading={feed.loading} error={feed.error}>
  {#if feed.data && feed.data.events.length > 0}
    <ul class="m-0 flex list-none flex-col gap-[10px] p-0">
      {#each feed.data.events as e, i (e.id)}
        <!-- One Watch per friend, on their newest line -->
        {@const watch = feed.data.events.findIndex(x => x.userId === e.userId) === i ? watchFor(e.userId) : null}
        <li class="flex items-center gap-3">
          <Avatar name={e.name} face={{ userId: e.userId, avatar: e.avatar }} size={36} />
          <span class="min-w-0 flex-1 text-[14px]"><strong class="font-semibold">{e.name}</strong> {activityText(e)}</span>
          {#if watch}
            <Button variant="outline" size="sm" aria-label="Watch {e.name}" onclick={() => void push(watch)}><Eye size={14} />Watch</Button>
          {/if}
          <span class="shrink-0 text-[12px] text-text-dim">{relativeTime(new Date(e.at), now)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="m-0 text-[14px] text-text-muted">No friend activity yet. 180s, big checkouts and rank-ups show up here.</p>
  {/if}
</HomeSection>
