<script lang="ts">
  // The first faces of a lobby, overlapping (the lobby indicator, a lobby's glance).
  import Avatar from './Avatar.svelte'

  let { faces, size = 20 }: { faces: { name: string; guest: boolean }[]; size?: number } = $props()
</script>

<span class="flex items-center pl-[6px] shrink-0" aria-hidden="true">
  {#each faces as face, i (i)}
    <Avatar
      name={face.name}
      guest={face.guest}
      {size}
      class="-ml-[6px] {face.guest ? 'bg-surface-active' : 'ring-2 ring-surface-active'}"
    />
  {/each}
</span>
