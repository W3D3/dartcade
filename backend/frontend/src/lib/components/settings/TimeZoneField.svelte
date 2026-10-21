<script lang="ts">
  // Settings' Profile: the time zone the day streak and XP's daily limits count days in. The first
  // browser sets it (lib/progress/timeZone.ts); moving changes it here.
  import { onMount } from 'svelte'
  import { api } from '$lib/api/client'
  import { browserTimeZone } from '$lib/progress/timeZone'
  import ErrorText from '../ErrorText.svelte'

  let zone = $state<string | null>(null)
  let error = $state('')
  const zones = Intl.supportedValuesOf('timeZone')

  onMount(async () => {
    const { data } = await api.GET('/api/me/preferences')
    zone = data?.timeZone ?? browserTimeZone()
  })

  async function save(next: string) {
    error = ''
    const { data } = await api.PUT('/api/me/preferences', { body: { timeZone: next } })
    if (data) zone = next
    else error = "Couldn't save the time zone. Try again."
  }
</script>

<div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
  <label for="time-zone" class="text-[14px] text-text-muted">Time zone</label>
  {#if zone !== null}
    <select
      id="time-zone"
      value={zone}
      onchange={e => void save(e.currentTarget.value)}
      class="min-w-0 max-w-[60%] h-9 rounded-[8px] border border-line-3 bg-surface-inset px-2 text-[14px] text-ink-2 font-[inherit]"
    >
      {#if !zones.includes(zone)}<option value={zone}>{zone}</option>{/if}
      {#each zones as z (z)}<option value={z}>{z.replaceAll('_', ' ')}</option>{/each}
    </select>
  {/if}
</div>
{#if error}<ErrorText>{error}</ErrorText>{/if}
<p class="m-0 text-[13px] leading-[1.5] text-text-dim">Your day streak and daily XP limits count days in this time zone.</p>
