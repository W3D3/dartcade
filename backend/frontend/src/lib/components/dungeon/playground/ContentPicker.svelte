<!-- A multi-select over one registry: rarity, the entry's own description (the exact effect text) and its trigger. -->
<script lang="ts">
  import { pickables } from '$lib/dungeon/playground/catalogue'
  import type { ContentEntry } from '$shared/dungeon/content/types.js'
  import Sprite from './Sprite.svelte'
  import { RARITY_COLOR } from '$lib/dungeon/view'
  import type { Registry } from '$lib/dungeon/playground/catalogue'

  let {
    label,
    registry,
    chosen,
    onchange,
  }: {
    label: string
    registry: Registry<ContentEntry>
    chosen: readonly string[]
    onchange: (ids: string[]) => void
  } = $props()

  const rows = $derived(pickables(registry))
  const toggle = (id: string) => onchange(chosen.includes(id) ? chosen.filter(c => c !== id) : [...chosen, id])
</script>

<details class="rounded-md border border-line-2 bg-surface-2">
  <summary class="cursor-pointer px-2 py-1.5 text-sm">{label} <span class="text-text-muted">({chosen.length})</span></summary>
  <ul class="flex max-h-64 flex-col gap-1 overflow-y-auto p-2" aria-label={label}>
    {#each rows as r (r.id)}
      <li>
        <label class="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" class="mt-1" checked={chosen.includes(r.id)} onchange={() => toggle(r.id)} />
          <Sprite id={r.id} scale={2} outline={RARITY_COLOR[r.rarity]} />
          <span class="min-w-0">
            <span class="font-medium">{r.name}</span>
            <span class="text-xs text-text-muted"> · {r.rarity}{r.status === 'draft' ? ' · draft' : ''} · {r.trigger}</span>
            <span class="block text-xs text-text-muted">{r.description}</span>
          </span>
        </label>
      </li>
    {/each}
  </ul>
</details>
