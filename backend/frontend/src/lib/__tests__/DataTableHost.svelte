<!-- Test-only wrapper around the generic DataTable, pinned to a concrete row type. A generic
     Svelte component's type param is inferred from template usage, which only happens inside a
     .svelte file; a plain .test.ts file importing DataTable directly can't trigger it. -->
<script lang="ts">
  import DataTable from '../components/ui/data-table/DataTable.svelte'
  import type { ColumnDef, SortingState, ColumnVisibilityState } from '@tanstack/svelte-table'
  import type { Features } from '../components/ui/data-table/features.js'
  import type { Row } from './dataTableRow.js'

  let {
    data,
    columns,
    sorting,
    columnVisibility,
    onrowclick,
    rowLabel,
    grouped = false,
    selectedId,
  }: {
    data: Row[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: ColumnDef<Features, Row, any>[]
    sorting?: SortingState
    columnVisibility?: ColumnVisibilityState
    onrowclick?: (row: Row) => void
    rowLabel?: (row: Row) => string
    /** Group rows by the first letter of their name. */
    grouped?: boolean
    selectedId?: string
  } = $props()
</script>

{#snippet header(group: string, count: number)}group {group} ({count}){/snippet}

<DataTable
  {data}
  {columns}
  {sorting}
  {columnVisibility}
  {onrowclick}
  {rowLabel}
  groupBy={grouped ? { key: (r: Row) => r.name[0], header } : undefined}
  isSelected={selectedId ? (r: Row) => r.id === selectedId : undefined}
/>
