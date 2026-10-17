// The TanStack Table v9 feature set every admin DataTable uses: sorting and column
// visibility, nothing else. Kept as one stable object (not rebuilt per render) and shared so
// every table's ColumnDef<Features, TData> lines up with what DataTable.svelte constructs.
import { columnVisibilityFeature, createSortedRowModel, rowSortingFeature, tableFeatures } from '@tanstack/svelte-table'

export const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
})

export type Features = typeof features
