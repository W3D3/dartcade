<script lang="ts">
  // Every hole, to reuse in the course: search, All / Official, and cards with where each comes
  // from. A card is dragged into the course by its handle (it's the page's `sortable` zone
  // "library", ids prefixed `lib:`), or added at the end with its + button.
  import { SearchInput } from '$lib/components/ui/input/index.js'
  import { Plus } from '@lucide/svelte'
  import Chip from '$lib/components/ui/chip/chip.svelte'
  import DragHandle from '$lib/components/lobby/DragHandle.svelte'
  import { holeOf, provenance, type HoleRow } from '$lib/minigolf/editor/course'
  import { plural } from '$lib/fmt'
  import HoleThumb from './HoleThumb.svelte'

  let {
    holes,
    inCourse,
    onadd,
  }: {
    holes: HoleRow[]
    /** The holes already in the course: they can't be added twice. */
    inCourse: string[]
    onadd: (holeId: string) => void
  } = $props()

  let search = $state('')
  let filter = $state<'all' | 'official'>('all')
  const shown = $derived(
    holes.filter(
      r =>
        // A hole that was never published and lost its draft (Discard draft) has nothing to reuse
        holeOf(r) !== null &&
        (filter === 'all' || r.ownerUserId === null) &&
        (holeOf(r)?.name ?? '').toLowerCase().includes(search.trim().toLowerCase()),
    ),
  )
</script>

<aside aria-label="Hole library" class="flex flex-col gap-3">
  <div class="flex items-baseline justify-between">
    <h2 class="m-0 font-display font-bold text-[22px] uppercase">Hole library</h2>
    <span class="text-[12px] text-text-muted">{plural(shown.length, 'hole')}</span>
  </div>
  <SearchInput bind:value={search} label="Search holes" class="h-10" />
  <div class="flex gap-[6px]">
    <Chip selected={filter === 'all'} onclick={() => (filter = 'all')}>All</Chip>
    <Chip selected={filter === 'official'} onclick={() => (filter = 'official')}>Official</Chip>
  </div>
  <ul class="m-0 grid list-none grid-cols-2 gap-[10px] p-0" data-sortable-zone="library">
    {#each shown as r (r.id)}
      {@const hole = holeOf(r)}
      {@const name = hole?.name ?? ''}
      {@const added = inCourse.includes(r.id)}
      <li
        data-sortable-id="lib:{r.id}"
        class="relative flex min-w-0 flex-col gap-[6px] rounded-[12px] border border-line-2 bg-surface-2 p-2"
      >
        <HoleThumb {hole} class="w-full h-[72px]" />
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-[14px] font-semibold">{name}</span>
          <span class="truncate text-[12px] text-text-muted">Par {hole?.par} · {provenance(r)}</span>
        </div>
        <div class="flex items-center justify-between">
          {#if added}
            <span class="pl-1 text-[12px] text-text-muted">In this course</span>
          {:else}
            <DragHandle {name} label="Drag {name} into the course" />
            <button
              type="button"
              aria-label="Add {name} to the course"
              title="Add to the course"
              onclick={() => onadd(r.id)}
              class="flex h-9 w-9 items-center justify-center rounded-[8px] border border-line-3 bg-transparent text-text-muted hover:bg-surface-hover"
              ><Plus size={16} /></button
            >
          {/if}
        </div>
      </li>
    {:else}
      <li class="col-span-2 text-[14px] text-text-muted">No holes match.</li>
    {/each}
  </ul>
  <p class="m-0 text-[12px] leading-[1.5] text-text-muted">
    Drag a hole into the course to reuse it. Holes are shared, so changing an official hole updates every course that uses it. Copy it first
    to make your own version.
  </p>
</aside>
