<script lang="ts">
  // Devices in tournament mode (Tournament-Onsite): each device at the venue, free or playing a
  // match, as every organizer sees it live. Opens the tournament socket as an organizer.
  import { onDestroy } from 'svelte'
  import { MonitorSmartphone } from '@lucide/svelte'
  import type { Tournament } from '$lib/api'
  import { createLiveStore } from '$lib/tournaments/live'
  import { deviceLine } from '$lib/tournaments/mode'

  let { tournamentId, format }: { tournamentId: string; format: Tournament['format'] } = $props()

  // svelte-ignore state_referenced_locally
  const live = createLiveStore(tournamentId)
  const { message, devices } = live
  onDestroy(() => live.destroy())
</script>

<section class="card flex flex-col gap-3 p-[18px]" aria-labelledby="onsite-devices">
  <h2 id="onsite-devices" class="text-body-lg font-semibold">Devices in tournament mode</h2>
  {#each $devices as d (d.id)}
    <div class="flex items-center gap-3">
      <MonitorSmartphone size={18} class="shrink-0 {d.matchKey ? 'text-live' : 'text-text-muted'}" aria-hidden="true" />
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-label font-semibold">{d.name}</span>
        <span class="text-small {d.matchKey ? 'text-live' : 'text-text-muted'}">{deviceLine(d, $message, format)}</span>
      </span>
    </div>
  {:else}
    <p class="text-small text-text-muted">No device is in tournament mode yet.</p>
  {/each}
  <p class="text-small text-text-muted">
    Any device logged in to your account or an organizer’s account can join. Leaving tournament mode always asks first.
  </p>
</section>
