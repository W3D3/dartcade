<script lang="ts">
  // Tournament-Create's Use paired boards (in person): whether a venue device may pick one of your
  // boards for automatic scoring, and which. Turned on, every board is picked.
  import { Target } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { api, type Board } from '$lib/api'
  import Chip from '$lib/components/ui/chip/chip.svelte'
  import SwitchRow from './SwitchRow.svelte'

  let { value, onchange }: { value: string[] | null; onchange: (boardIds: string[] | null) => void } = $props()

  let boards = $state<Board[]>([])
  onMount(async () => {
    boards = (await api.GET('/api/boards').catch(() => null))?.data?.boards ?? []
  })

  const toggle = (id: string) => onchange(value?.includes(id) ? value.filter(b => b !== id) : [...(value ?? []), id])
</script>

<SwitchRow
  id="tc-boards"
  label="Use paired boards"
  help="When a match starts, the device can pick one of your boards for automatic scoring. Scores can always be typed in by hand."
  checked={value !== null}
  onchange={on => onchange(on ? boards.map(b => b.id) : null)}
/>
{#if value !== null}
  <div class="flex flex-wrap gap-2" role="group" aria-label="Boards">
    {#each boards as b (b.id)}
      <Chip selected={value.includes(b.id)} onclick={() => toggle(b.id)}><Target size={14} aria-hidden="true" />{b.name}</Chip>
    {:else}
      <span class="text-caption text-text-dim">You haven’t paired a board yet.</span>
    {/each}
  </div>
{/if}
