// The TanStack Table v9 feature set every DataTable uses: sorting, column visibility and column
// sizing (with drag resizing, used only where a table turns it on). Kept as one stable object
// (not rebuilt per render) and shared so every table's ColumnDef<Features, TData> lines up with
// what DataTable.svelte constructs.
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/svelte-table'

export const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  sortedRowModel: createSortedRowModel(),
})

export type Features = typeof features
