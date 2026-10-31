<script lang="ts">
  // The first faces of a lobby, overlapping (the lobby indicator, a lobby's glance).
  import Avatar from './Avatar.svelte'
  import type { components } from '$lib/api/schema'

  let {
    faces,
    size = 20,
  }: {
    faces: { userId: string | null; name: string; guest: boolean; avatar?: components['schemas']['Avatar'] }[]
    size?: number
  } = $props()
</script>

<span class="flex items-center pl-[6px] shrink-0" aria-hidden="true">
  {#each faces as face, i (i)}
    <Avatar
      name={face.name}
      guest={face.guest}
      face={{ avatar: face.avatar ?? { kind: 'none' }, userId: face.userId }}
      {size}
      class="-ml-[6px] {face.guest ? 'bg-surface-active' : 'ring-2 ring-surface-active'}"
    />
  {/each}
</span>
