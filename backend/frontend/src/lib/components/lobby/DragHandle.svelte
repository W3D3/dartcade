<script lang="ts">
  // The host's grip on a person's row: drag it to move them (lib/actions/sortable.ts), or
  // focus it and use the arrow keys. Only rendered for whoever may move people.
  import { GripVertical } from '@lucide/svelte'

  let {
    name,
    describedby,
  }: {
    name: string
    /** The hint naming the keys. */
    describedby?: string
  } = $props()
</script>

<button
  type="button"
  data-sortable-handle
  aria-label="Reorder {name}"
  aria-describedby={describedby}
  class="w-8 h-11 md:h-9 shrink-0 flex items-center justify-center p-0 rounded-[8px] border-0 bg-transparent
         text-text-muted cursor-grab touch-none select-none"
>
  <GripVertical size={18} strokeWidth={2} />
</button>
