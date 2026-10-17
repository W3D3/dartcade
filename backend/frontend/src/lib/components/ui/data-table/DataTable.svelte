<!-- A generic sortable, hideable-column table (AdminUsers, AdminFlags): real <table> markup, a
     sticky header, accessible sort buttons and horizontal scroll on narrow screens instead of
     page overflow. Sorting and column visibility are the caller's state (bindable), so it can
     persist them or wire a ColumnToggle to the same object. Optionally groups rows under a
     header row per group (sorted within each) and marks a selected row. -->
<script lang="ts" generics="TData extends RowData">
  import type { RowData, ColumnDef, SortingState, ColumnVisibilityState } from '@tanstack/svelte-table'
  import { createTable, FlexRender } from '@tanstack/svelte-table'
  import type { Snippet } from 'svelte'
  import { ArrowDown, ArrowUp, ChevronsUpDown } from '@lucide/svelte'
  import { features, type Features } from './features.js'
  import { activateRowOnKey } from './activateRowOnKey.js'
  import { groupRows } from './groupRows.js'

  let {
    data,
    columns,
    sorting = $bindable([]),
    columnVisibility = $bindable({}),
    emptyState,
    onrowclick,
    rowLabel,
    isSelected,
    groupBy,
    tableClass = 'min-w-[720px]',
  }: {
    data: TData[]
    // NoInfer: columns is a union of several ColumnDef shapes (one per accessor/display call),
    // which TS can't cleanly re-derive TData from; let `data` alone drive the inference. `any`
    // (not the default `unknown`) for TValue: build the array with `helper.columns([...])`, which
    // is typed the same way, so each column's own cell value type still checks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: ColumnDef<Features, NoInfer<TData>, any>[]
    sorting?: SortingState
    columnVisibility?: ColumnVisibilityState
    /** Shown instead of the body when there are no rows. */
    emptyState?: Snippet
    onrowclick?: (row: TData) => void
    /** With onrowclick, an accessible name for the row ("Open details for X") — the row otherwise
     *  reads as its cells with no indication it's a button, which a sighted pointer user sees from
     *  the hover/cursor style alone. */
    rowLabel?: (row: TData) => string
    /** The row that's open elsewhere (a details card): highlighted, aria-current. */
    isSelected?: (row: TData) => boolean
    /** Group the rows: `key` names a row's group, `compare` orders the groups (default: by
     *  name), `header` renders a group's header row (its name and row count). */
    groupBy?: { key: (row: TData) => string; compare?: (a: string, b: string) => number; header: Snippet<[string, number]> }
    /** Classes for the <table>; the default keeps a wide table scrolling rather than squashed. */
    tableClass?: string
  } = $props()

  const table = createTable({
    features,
    get columns() {
      return columns
    },
    get data() {
      return data
    },
    state: {
      get sorting() {
        return sorting
      },
      get columnVisibility() {
        return columnVisibility
      },
    },
    onSortingChange: updater => {
      sorting = typeof updater === 'function' ? updater(sorting) : updater
    },
    onColumnVisibilityChange: updater => {
      columnVisibility = typeof updater === 'function' ? updater(columnVisibility) : updater
    },
  })

  const rows = $derived(table.getRowModel().rows)
  // Without groupBy: one unnamed group, so the markup below has a single path
  const groups = $derived(
    groupBy ? groupRows(rows, r => groupBy.key(r.original), groupBy.compare ?? ((a, b) => a.localeCompare(b))) : [{ group: '', rows }],
  )

  const ariaSort = (sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' =>
    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
</script>

<div class="card overflow-x-auto">
  <table class="w-full {tableClass} border-collapse text-left text-[14px]">
    <thead>
      {#each table.getHeaderGroups() as group (group.id)}
        <tr>
          {#each group.headers as header (header.id)}
            <th
              scope="col"
              class="sticky top-0 z-10 whitespace-nowrap border-b border-line-3 bg-surface-panel p-3 font-semibold text-text-muted"
              aria-sort={header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined}
            >
              {#if !header.isPlaceholder}
                {#if header.column.getCanSort()}
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1 text-text-muted outline-none hover:text-text focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:2px]"
                    onclick={header.column.getToggleSortingHandler()}
                  >
                    <FlexRender {header} />
                    {#if header.column.getIsSorted() === 'asc'}
                      <ArrowUp size={14} />
                    {:else if header.column.getIsSorted() === 'desc'}
                      <ArrowDown size={14} />
                    {:else}
                      <ChevronsUpDown size={14} class="opacity-50" />
                    {/if}
                  </button>
                {:else}
                  <FlexRender {header} />
                {/if}
              {/if}
            </th>
          {/each}
        </tr>
      {/each}
    </thead>
    <tbody>
      {#each groups as g (g.group)}
        {#if groupBy}
          <tr class="border-b border-line-3 bg-surface-inset">
            <th scope="rowgroup" colspan={table.getVisibleLeafColumns().length} class="px-3 py-2 text-left font-normal">
              {@render groupBy.header(g.group, g.rows.length)}
            </th>
          </tr>
        {/if}
        {#each g.rows as row (row.id)}
          {@const selected = isSelected?.(row.original) ?? false}
          <tr
            tabindex={onrowclick ? 0 : undefined}
            aria-label={onrowclick && rowLabel ? rowLabel(row.original) : undefined}
            aria-current={selected ? 'true' : undefined}
            class="border-b border-line-3 last:border-0 outline-none {selected
              ? 'bg-surface-picked [box-shadow:inset_3px_0_0_var(--color-accent)]'
              : ''} {onrowclick
              ? 'cursor-pointer hover:bg-surface-hover focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:-2px]'
              : ''}"
            onclick={() => onrowclick?.(row.original)}
            onkeydown={e => {
              if (activateRowOnKey(e.key, onrowclick && (() => onrowclick(row.original)))) e.preventDefault()
            }}
          >
            {#each row.getVisibleCells() as cell (cell.id)}
              <td class="p-3 align-middle">
                <FlexRender {cell} />
              </td>
            {/each}
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
  {#if rows.length === 0 && emptyState}
    <div class="p-6 text-center text-[15px] text-text-muted">
      {@render emptyState()}
    </div>
  {/if}
</div>
