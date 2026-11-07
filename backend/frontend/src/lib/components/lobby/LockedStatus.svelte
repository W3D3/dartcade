<script lang="ts">
  // Someone's place for the next game while the duo's ranked search runs: the same word as ever,
  // in a pill with a lock (MM-Lobby-Phone board). Nothing here can be changed until the search ends.
  import { Check, Lock } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'

  let { person }: { person: LobbyPerson } = $props()
  const text = $derived(!person.plays ? 'Sits out' : person.ready ? 'Ready' : 'Not ready')
  const ready = $derived(person.plays && person.ready)
</script>

<span
  class="inline-flex h-7 items-center gap-[6px] whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold
         {ready ? 'border-accent-line text-accent' : 'border-line-chip text-text-muted'}"
  title="Locked while you search"
>
  {#if ready}<Check size={13} aria-hidden="true" />{/if}{text}<Lock size={12} aria-hidden="true" />
</span>
