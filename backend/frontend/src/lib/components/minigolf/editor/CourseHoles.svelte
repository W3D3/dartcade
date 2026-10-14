<script lang="ts">
  // A course's holes in playing order (the course editor's centre): drag handle, number, thumbnail,
  // name, par, Edit and a menu (Duplicate, Remove from course); totals above, New hole below.
  // It's one zone of the page's `sortable` (`data-sortable-zone="course"`); the page handles drops.
  import { Ellipsis, Plus } from '@lucide/svelte'
  import DragHandle from '$lib/components/lobby/DragHandle.svelte'
  import MenuItem from '$lib/components/lobby/MenuItem.svelte'
  import PopoverMenu from '$lib/components/lobby/PopoverMenu.svelte'
  import ReorderStatus from '$lib/components/lobby/ReorderStatus.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { courseTotals, holeOf, holeTags, type HoleRow } from '$lib/minigolf/editor/course'
  import { plural } from '$lib/fmt'
  import HoleThumb from './HoleThumb.svelte'

  let {
    items,
    courseId,
    announcement = '',
    busy = false,
    onduplicate,
    onremove,
    onnew,
  }: {
    /** In playing order; `row` is missing for a hole the library doesn't have (deleted). */
    items: { id: string; name: string; row?: HoleRow }[]
    courseId: string
    announcement?: string
    busy?: boolean
    onduplicate: (holeId: string) => void
    onremove: (holeId: string) => void
    onnew: () => void
  } = $props()

  const hintId = $props.id()
  const totals = $derived(courseTotals(items.map(i => ({ par: (i.row && holeOf(i.row)?.par) ?? 0 }))))
</script>

<section aria-labelledby="{hintId}-title" class="flex flex-col gap-3">
  <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
    <h2 id="{hintId}-title" class="m-0 font-display font-bold text-[22px] uppercase">Holes · played in this order</h2>
    <span class="text-[13px] text-text-muted">{plural(totals.holes, 'hole')} · par {totals.par} · ≈ {totals.minutes} min</span>
  </div>
  <ReorderStatus id={hintId} hint="Arrow up or down moves a hole one place." {announcement} />
  <ol class="m-0 p-0 list-none flex flex-col gap-[6px] min-h-[56px] rounded-[12px]" data-sortable-zone="course">
    {#each items as item, i (item.id)}
      {@const hole = item.row && holeOf(item.row)}
      <li
        data-sortable-id={item.id}
        class="relative flex items-center gap-3 py-2 pl-1 pr-2 rounded-[12px] bg-surface-2 border border-line-2"
      >
        <DragHandle name={item.name} describedby={hintId} />
        <span class="w-6 text-center font-display font-bold text-[18px] text-text-muted">{i + 1}</span>
        <HoleThumb hole={hole ?? null} />
        <div class="flex min-w-0 flex-grow flex-col">
          <span class="truncate text-[15px] font-semibold">{item.name}</span>
          <span class="truncate text-[12px] text-text-muted">{hole ? holeTags(hole) || 'flat' : 'This hole is gone'}</span>
        </div>
        {#if hole}<span class="shrink-0 text-[13px] text-text-muted"
            ><span class="label-caps text-[11px]">Par</span> <span class="font-semibold text-text">{hole.par}</span></span
          >{/if}
        {#if hole}<a href="#/admin/minigolf/holes/{item.id}?course={courseId}" class="shrink-0 px-2 text-[14px] font-semibold">Edit</a>{/if}
        <PopoverMenu
          label="More for {item.name}"
          triggerLabel="More for {item.name}"
          align="right"
          width={200}
          triggerClass="w-9 h-9 shrink-0 flex items-center justify-center bg-transparent border-0 rounded-[8px] text-text-muted hover:bg-surface-hover"
        >
          {#snippet trigger()}<Ellipsis size={18} />{/snippet}
          {#snippet children(close: () => void)}
            {#if hole}<MenuItem
                label="Duplicate"
                disabled={busy}
                onclick={() => {
                  close()
                  onduplicate(item.id)
                }}
              />{/if}
            <MenuItem
              label="Remove from course"
              danger
              onclick={() => {
                close()
                onremove(item.id)
              }}
            />
          {/snippet}
        </PopoverMenu>
      </li>
    {:else}
      <li class="p-4 text-[14px] text-text-muted border border-dashed border-line-dashed rounded-[12px]">No holes yet.</li>
    {/each}
  </ol>
  <div class="flex flex-wrap items-center gap-3">
    <Button variant="outline" disabled={busy} onclick={onnew}><Plus size={16} />New hole</Button>
    <span class="text-[13px] text-text-muted">or drag one in from the hole library</span>
  </div>
</section>
