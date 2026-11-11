<script lang="ts">
  // A profile's Friends section: their friends, mutual ones first and marked, with the mutual
  // count in the header and an Add friend action per person. Without the list (a stranger, or
  // Only me) only the count shows.
  import { hrefs } from '$lib/routes'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'

  import type { LastSeen } from '$lib/friends/view'
  type PlayerFriends = components['schemas']['PlayerFriends']

  let { userId, self, lastSeen = $bindable() }: { userId: string; self: boolean; lastSeen?: LastSeen } = $props()

  let data = $state<PlayerFriends | null>(null)
  // Requests sent from this list, before the next load says so
  let sent = $state(new Set<string>())
  let error = $state('')

  $effect(() => {
    const id = userId
    data = null
    lastSeen = undefined
    sent = new Set()
    void api.GET('/api/users/{id}/friends', { params: { path: { id } } }).then(r => {
      if (id !== userId) return
      data = r.data ?? null
      lastSeen = r.data?.lastSeen
    })
  })

  const mutual = (n: number) => `${n} mutual friend${n === 1 ? '' : 's'}`

  async function add(name: string, id: string) {
    error = ''
    const res = await api.POST('/api/friends/requests', { body: { name } })
    if (res.error) error = res.error.error
    else sent = new Set([...sent, id])
  }
</script>

{#if data && (data.friends || data.mutualCount > 0)}
  <section aria-label="Friends" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
    <div class="flex items-baseline justify-between">
      <span class="text-[12px] label-caps text-text-dim">Friends</span>
      {#if !self}<span class="text-[13px] text-text-muted">{mutual(data.mutualCount)}</span>{/if}
    </div>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    {#if data.friends === null}
      <p class="text-[14px] text-text-muted">Only friends can see their list.</p>
    {:else if data.friends.length === 0}
      <p class="text-[14px] text-text-muted">No friends yet.</p>
    {:else}
      <ul class="flex flex-col">
        {#each data.friends as f (f.id)}
          <li class="flex items-center gap-3 py-2 border-b border-line last:border-b-0">
            <a href={hrefs.profile(f.id)} class="flex items-center gap-3 min-w-0 flex-1 text-text no-underline">
              <Avatar name={f.name} face={{ avatar: f.avatar, userId: f.id }} size={36} />
              <span class="flex flex-col min-w-0">
                <span class="truncate text-[15px] font-medium">{f.name}</span>
                {#if f.mutual}<span class="text-[12px] text-accent">Mutual friend</span>{/if}
              </span>
            </a>
            {#if f.relation === 'friend'}
              <span class="text-[13px] text-text-muted">Friends</span>
            {:else if f.relation === 'requested' || sent.has(f.id)}
              <span class="text-[13px] text-text-muted">Request sent</span>
            {:else if f.relation === 'incoming'}
              <a href={hrefs.friends()} class="text-[13px] font-semibold text-accent no-underline">Wants to be friends</a>
            {:else if f.relation === 'none'}
              <Button variant="outline" onclick={() => void add(f.name, f.id)} class="h-8 px-3 rounded-key text-[13px] font-semibold"
                >Add friend</Button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
