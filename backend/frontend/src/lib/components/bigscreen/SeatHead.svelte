<script lang="ts">
  // The head of a seat on the big screen: the avatar and the name, then whatever the game adds (pips, a pill). A card's by default, a row's with the row scale.
  import type { Snippet } from 'svelte'
  import type { RowScale } from '$lib/bigscreen/rowScale'
  import Avatar from '$lib/components/Avatar.svelte'

  let { name, active, scale, children }: { name: string; active: boolean; scale?: Pick<RowScale, 'avatar' | 'name'>; children?: Snippet } =
    $props()
  const sz = $derived(scale ?? { avatar: 64, name: 44 })
</script>

<div class="flex items-center {scale ? 'gap-[22px]' : 'gap-[18px]'}">
  <Avatar {name} size={sz.avatar} tone={active ? 'accent' : 'quiet'} />
  <span class="min-w-0 flex-1 truncate font-bold" style="font-size:{sz.name}px">{name}</span>
  {@render children?.()}
</div>
