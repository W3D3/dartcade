<!-- A generic sortable, hideable-column table (AdminUsers, AdminFlags, History): real <table> markup, a
     sticky header, accessible sort buttons and horizontal scroll on narrow screens instead of
     page overflow. Sorting, column visibility and column sizes are the caller's state (bindable), so it can
     persist them or wire a ColumnToggle to the same object. Optionally groups rows under a
     header row per group (sorted within each), marks a selected row, makes each row a link, lets
     the columns be resized by dragging their header edges, and shows each row as a card below lg. -->
<script lang="ts" generics="TData extends RowData">
  import type { RowData, ColumnDef, SortingState, ColumnVisibilityState, ColumnSizingState } from '@tanstack/svelte-table'
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
    columnSizing = $bindable({}),
    emptyState,
    onrowclick,
    rowHref,
    rowLabel,
    isSelected,
    groupBy,
    resizable = false,
    growColumn,
    narrowRow,
    tableClass = 'min-w-[720px]',
    headClass = 'p-3 font-semibold text-text-muted',
    cellClass = 'p-3',
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
    /** Column id → width in px, for the columns resized away from their `size`. */
    columnSizing?: ColumnSizingState
    /** Shown instead of the body when there are no rows. */
    emptyState?: Snippet
    onrowclick?: (row: TData) => void
    /** The row is a link to this address: a real <a> under the cells, so it opens in a new tab and
     *  is its own tab stop. Buttons and links inside the cells sit above it and keep their clicks. */
    rowHref?: (row: TData) => string
    /** With onrowclick or rowHref, an accessible name for the row ("Open details for X") — the row
     *  otherwise reads as its cells with no indication it's a button, which a sighted pointer user
     *  sees from the hover/cursor style alone. */
    rowLabel?: (row: TData) => string
    /** The row that's open elsewhere (a details card): highlighted, aria-current. */
    isSelected?: (row: TData) => boolean
    /** Group the rows: `key` names a row's group, `compare` orders the groups (default: by
     *  name), `header` renders a group's header row (its name and row count). */
    groupBy?: { key: (row: TData) => string; compare?: (a: string, b: string) => number; header: Snippet<[string, number]> }
    /** Columns take their TanStack size, and a handle on each header's right edge resizes it
     *  (drag, or the arrow keys; a double click resets it). Turn a column's off with `enableResizing: false`. */
    resizable?: boolean
    /** With resizable: this column takes the width the others leave; its `size` is its minimum. */
    growColumn?: string
    /** Below lg, each row as this card instead of the table (rowHref still makes it a link). */
    narrowRow?: Snippet<[TData]>
    /** Classes for the <table>; the default keeps a wide table scrolling rather than squashed. */
    tableClass?: string
    /** Classes for the header cells and the body cells (padding, type). */
    headClass?: string
    cellClass?: string
  } = $props()

  const table = createTable({
    features,
    columnResizeMode: 'onChange',
    get enableColumnResizing() {
      return resizable
    },
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
      get columnSizing() {
        return columnSizing
      },
    },
    onSortingChange: updater => {
      sorting = typeof updater === 'function' ? updater(sorting) : updater
    },
    onColumnVisibilityChange: updater => {
      columnVisibility = typeof updater === 'function' ? updater(columnVisibility) : updater
    },
    onColumnSizingChange: updater => {
      columnSizing = typeof updater === 'function' ? updater(columnSizing) : updater
    },
  })

  const rows = $derived(table.getRowModel().rows)
  // Without groupBy: one unnamed group, so the markup below has a single path
  const groups = $derived(
    groupBy ? groupRows(rows, r => groupBy.key(r.original), groupBy.compare ?? ((a, b) => a.localeCompare(b))) : [{ group: '', rows }],
  )
  const clickable = $derived(Boolean(onrowclick || rowHref))
  // Over a row link the cells let clicks through to it, except on their own buttons and links;
  // `relative` paints them above the link
  const overLink = 'relative pointer-events-none cursor-default [&_a]:pointer-events-auto [&_button]:pointer-events-auto'

  const ariaSort = (sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' =>
    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'

  const RESIZE_STEP = 16
  function resizeByKey(e: KeyboardEvent, column: { id: string; getSize: () => number }) {
    const step = e.key === 'ArrowRight' ? RESIZE_STEP : e.key === 'ArrowLeft' ? -RESIZE_STEP : 0
    if (!step) return
    e.preventDefault()
    // getSize() is already clamped to the column's min and max, so the state never runs past them by more than a step
    table.setColumnSizing(s => ({ ...s, [column.id]: column.getSize() + step }))
  }
</script>

{#snippet rowLink(row: TData)}
  {#if rowHref}
    <a href={rowHref(row)} aria-label={rowLabel?.(row)} class="absolute inset-0 outline-offset-[-2px]"></a>
  {/if}
{/snippet}

<div class="card overflow-x-auto">
  <table
    class="w-full {tableClass} border-collapse text-left text-[14px] {resizable ? 'table-fixed' : ''} {narrowRow ? 'hidden lg:table' : ''}"
    style:min-width={resizable ? `${table.getTotalSize()}px` : undefined}
  >
    <thead>
      {#each table.getHeaderGroups() as group (group.id)}
        <tr>
          {#each group.headers as header (header.id)}
            <th
              scope="col"
              class="sticky top-0 z-10 whitespace-nowrap border-b border-line-3 bg-surface-panel {headClass}"
              style:width={resizable && header.column.id !== growColumn ? `${header.getSize()}px` : undefined}
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
                {#if header.column.getCanResize() && header.column.id !== growColumn}
                  <!-- A focusable separator is a splitter: the arrow keys resize the column -->
                  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize {typeof header.column.columnDef.header === 'string'
                      ? header.column.columnDef.header
                      : header.column.id}"
                    aria-valuenow={header.getSize()}
                    tabindex="0"
                    title="Drag to resize, double-click to reset"
                    onmousedown={header.getResizeHandler()}
                    ontouchstart={header.getResizeHandler()}
                    ondblclick={() => header.column.resetSize()}
                    onkeydown={e => resizeByKey(e, header.column)}
                    class="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-2 after:right-0 after:w-px hover:after:bg-accent focus-visible:after:bg-accent {header.column.getIsResizing()
                      ? 'after:bg-accent'
                      : 'after:bg-line-3'}"
                  ></div>
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
            class="border-b border-line-3 last:border-0 outline-none {rowHref ? 'relative' : ''} {selected
              ? 'bg-surface-picked [box-shadow:inset_3px_0_0_var(--color-accent)]'
              : ''} {clickable
              ? 'cursor-pointer hover:bg-surface-hover focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:[outline-offset:-2px]'
              : ''}"
            onclick={() => onrowclick?.(row.original)}
            onkeydown={e => {
              if (activateRowOnKey(e.key, onrowclick && (() => onrowclick(row.original)))) e.preventDefault()
            }}
          >
            {#each row.getVisibleCells() as cell, i (cell.id)}
              <td class="{cellClass} align-middle {resizable ? 'overflow-hidden' : ''}">
                {#if rowHref}
                  {#if i === 0}{@render rowLink(row.original)}{/if}
                  <div class={overLink}><FlexRender {cell} /></div>
                {:else}
                  <FlexRender {cell} />
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
  {#if narrowRow}
    <ul class="m-0 list-none p-0 lg:hidden">
      {#each rows as row (row.id)}
        <li class="relative border-b border-line-3 last:border-0 {rowHref ? 'hover:bg-surface-hover' : ''}">
          {@render rowLink(row.original)}
          <div class={rowHref ? overLink : ''}>{@render narrowRow(row.original)}</div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if rows.length === 0 && emptyState}
    <div class="p-6 text-center text-[15px] text-text-muted">
      {@render emptyState()}
    </div>
  {/if}
</div>
