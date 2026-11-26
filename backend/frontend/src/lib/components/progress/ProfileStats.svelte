<script lang="ts">
  // The profile's Stats tab: a card per mode the player has finished a game in. Read when the tab
  // opens (not with the profile), for whoever the profile is: the same stats everyone may see.
  import { api } from '$lib/api'
  import { Skeleton } from '$lib/components/ui/skeleton/index.js'
  import ProfileModeStats from '$lib/components/progress/ProfileModeStats.svelte'
  import type { ModeStatsBlock } from '$lib/profile/modeStats'

  let { userId, self }: { userId: string; self: boolean } = $props()

  let modes = $state<ModeStatsBlock[] | null>(null)
  let failed = $state(false)

  $effect(() => {
    const id = userId
    modes = null
    failed = false
    void api.GET('/api/users/{id}/mode-stats', { params: { path: { id } } }).then(r => {
      if (id !== userId) return
      modes = r.data?.modes ?? null
      failed = !r.data
    })
  })
</script>

{#if modes === null && !failed}
  <div role="status" aria-busy="true" aria-label="Loading stats" class="flex flex-col gap-4 md:gap-6">
    {#each [0, 1] as i (i)}
      <div class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
        <Skeleton class="h-9 w-48" />
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each [0, 1, 2] as j (j)}<Skeleton class="h-[76px] rounded-lg" />{/each}
        </div>
      </div>
    {/each}
  </div>
{:else if failed}
  <p class="text-body text-text-muted">Couldn't load the stats. Try again in a moment.</p>
{:else if modes?.length}
  <ProfileModeStats {modes} {self} />
{:else}
  <p class="text-body text-text-muted">No games played yet.</p>
{/if}
