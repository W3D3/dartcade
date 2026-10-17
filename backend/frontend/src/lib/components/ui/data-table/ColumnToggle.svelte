<!-- "Columns" menu next to a DataTable: a bits-ui dropdown of checkboxes to show or hide its
     hideable columns. Operates on the same `visibility` state DataTable takes, so it needs no
     table instance. -->
<script lang="ts">
  import { DropdownMenu } from 'bits-ui'
  import { Check, ChevronDown, Columns3 } from '@lucide/svelte'
  import { buttonVariants } from '$lib/components/ui/button/button-variants.js'
  import { cn } from '$lib/utils.js'

  let {
    columns,
    visibility = $bindable({}),
  }: {
    /** Every hideable column, in menu order. */
    columns: { id: string; label: string }[]
    /** Column id → visible; a column with no entry is visible. */
    visibility?: Record<string, boolean>
  } = $props()

  // `Record<string, boolean>` claims every id is present; a column with no entry is actually
  // still visible, so the `!== false` (not a plain `visibility[id]`) is load-bearing.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
  const isVisible = (id: string): boolean => visibility[id] !== false
  const setVisible = (id: string, v: boolean): void => {
    visibility = { ...visibility, [id]: v }
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}>
    <Columns3 size={16} />
    Columns
    <ChevronDown size={14} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      align="end"
      sideOffset={6}
      class="z-[60] min-w-[180px] box-border p-[6px] rounded-xl bg-surface-hover border border-line-popover
             [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] flex flex-col gap-[2px] outline-none"
    >
      {#each columns as col (col.id)}
        <DropdownMenu.CheckboxItem
          checked={isVisible(col.id)}
          onCheckedChange={v => setVisible(col.id, v)}
          class="flex h-10 items-center gap-[10px] rounded-lg px-[10px] text-[14px] text-text cursor-pointer outline-none
                 data-[highlighted]:bg-surface-paused"
        >
          {#snippet children({ checked }: { checked: boolean })}
            <span class="w-4 flex shrink-0"
              >{#if checked}<Check size={16} strokeWidth={3} class="text-accent" />{/if}</span
            >
            <span class="truncate">{col.label}</span>
          {/snippet}
        </DropdownMenu.CheckboxItem>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
