<script lang="ts">
  // Everything on the hole, one row each (the outline, tee and cup, then elementsOf); clicking a row selects it.
  import type { ElementRef } from '$shared/minigolf/checks'
  import type { Hole } from '$shared/minigolf/types'
  import { elementsOf } from '$lib/minigolf/editor/ops'

  let { hole, selection, onselect }: { hole: Hole; selection: ElementRef | null; onselect: (ref: ElementRef) => void } = $props()

  const at = (p: readonly [number, number]) => `${Math.round(p[0])}, ${Math.round(p[1])}`
  const rows = $derived<{ ref: ElementRef; label: string; detail: string }[]>([
    { ref: { kind: 'outline', index: 0 }, label: 'Outline', detail: `${(hole.shape?.corners ?? hole.outline).length} corners` },
    { ref: { kind: 'tee', index: 0 }, label: 'Tee', detail: at(hole.tee) },
    { ref: { kind: 'cup', index: 0 }, label: 'Cup', detail: at(hole.cup.at) },
    ...elementsOf(hole),
  ])
  // The outline row stands for every corner and edge
  const isSelected = (ref: ElementRef) =>
    !!selection &&
    (ref.kind === 'outline' ? ['outline', 'edge'].includes(selection.kind) : selection.kind === ref.kind && selection.index === ref.index)
</script>

<section aria-label="Elements" class="flex flex-col gap-2">
  <h2 class="m-0 text-[11px] label-caps text-text-dim">Elements · {rows.length}</h2>
  <ul class="m-0 flex list-none flex-col gap-[2px] p-0">
    {#each rows as r (`${r.ref.kind}-${r.ref.index}`)}
      <li>
        <button
          type="button"
          aria-current={isSelected(r.ref) || undefined}
          onclick={() => onselect(r.ref)}
          class="flex w-full items-center justify-between gap-2 rounded-[8px] border-0 px-2 py-[6px] text-left text-[14px] text-text cursor-pointer
                 {isSelected(r.ref) ? 'bg-accent-tint' : 'bg-transparent hover:bg-surface-hover'}"
          ><span>{r.label}</span><span class="text-[13px] text-text-muted">{r.detail}</span></button
        >
      </li>
    {/each}
  </ul>
</section>
