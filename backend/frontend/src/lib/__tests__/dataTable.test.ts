import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { createColumnHelper } from '@tanstack/svelte-table'
import DataTableHost from './DataTableHost.svelte'
import { activateRowOnKey } from '../components/ui/data-table/activateRowOnKey.js'
import type { Row } from './dataTableRow.js'
import type { Features } from '../components/ui/data-table/features'

const helper = createColumnHelper<Features, Row>()
const columns = helper.columns([
  helper.accessor('name', { header: 'Name' }),
  helper.accessor('score', { header: 'Score', enableSorting: false }),
])

const rows: Row[] = [
  { id: 'a', name: 'Ada', score: 10 },
  { id: 'b', name: 'Bo', score: 20 },
]

describe('DataTable', () => {
  it('renders a sortable header (with aria-sort) and every row', () => {
    const out = render(DataTableHost, { props: { data: rows, columns, sorting: [{ id: 'name', desc: false }] } }).body
    expect(out).toContain('Name')
    expect(out).toContain('Score')
    expect(out).toContain('Ada')
    expect(out).toContain('20')
    expect(out).toMatch(/aria-sort="ascending"[^>]*>[\s\S]*?Name/)
  })

  it('marks a sortable column with no active sort as aria-sort="none"', () => {
    const out = render(DataTableHost, { props: { data: rows, columns } }).body
    expect(out).toMatch(/aria-sort="none"[^>]*>[\s\S]*?Name/)
  })

  it('does not put a sort button on a column with enableSorting: false', () => {
    const out = render(DataTableHost, { props: { data: rows, columns } }).body
    const scoreHeader = out.slice(out.indexOf('Score') - 200, out.indexOf('Score') + 20)
    expect(scoreHeader).not.toContain('<button')
  })

  it('hides a column whose visibility is false', () => {
    const out = render(DataTableHost, { props: { data: rows, columns, columnVisibility: { score: false } } }).body
    expect(out).toContain('Name')
    expect(out).not.toContain('Score')
    // One <td> per row left (Name only), not two
    expect(out.match(/<td/g)).toHaveLength(2)
  })

  it('puts a rowgroup header row over each group, groups in order', () => {
    const data: Row[] = [...rows, { id: 'c', name: 'Al', score: 5 }]
    const out = render(DataTableHost, { props: { data, columns, grouped: true } }).body
    expect(out.match(/scope="rowgroup"/g)).toHaveLength(2)
    expect(out).toMatch(/colspan="2"/)
    expect(out.indexOf('group A (2)')).toBeGreaterThan(-1)
    expect(out.indexOf('group A (2)')).toBeLessThan(out.indexOf('group B (1)'))
    expect(out.indexOf('group B (1)')).toBeLessThan(out.indexOf('>Bo<'))
  })

  it('marks only the selected row aria-current, without aria-selected', () => {
    const out = render(DataTableHost, { props: { data: rows, columns, selectedId: 'b' } }).body
    expect(out.match(/aria-current="true"/g)).toHaveLength(1)
    expect(out).toMatch(/aria-current="true"[^>]*>[\s\S]*?>Bo</)
    expect(out).not.toContain('aria-selected')
  })

  it('renders no rows without crashing when data is empty', () => {
    const out = render(DataTableHost, { props: { data: [], columns } }).body
    expect(out).toContain('Name')
    expect(out).not.toContain('Ada')
  })

  it('makes a row keyboard-reachable (tabindex="0") only when onrowclick is given', () => {
    const withClick = render(DataTableHost, { props: { data: rows, columns, onrowclick: () => {} } }).body
    expect(withClick).toContain('tabindex="0"')
    const without = render(DataTableHost, { props: { data: rows, columns } }).body
    expect(without).not.toContain('tabindex')
  })

  it('labels a clickable row with rowLabel, for a screen reader (not just the hover cursor)', () => {
    const out = render(DataTableHost, {
      props: { data: rows, columns, onrowclick: () => {}, rowLabel: (r: Row) => `Open details for ${r.name}` },
    }).body
    expect(out).toContain('aria-label="Open details for Ada"')
  })
})

describe('activateRowOnKey', () => {
  it('calls the row through on Enter and on Space', () => {
    const activate = vi.fn()
    expect(activateRowOnKey('Enter', activate)).toBe(true)
    expect(activateRowOnKey(' ', activate)).toBe(true)
    expect(activate).toHaveBeenCalledTimes(2)
  })

  it('does nothing for any other key, or with no row to activate', () => {
    const activate = vi.fn()
    expect(activateRowOnKey('a', activate)).toBe(false)
    expect(activateRowOnKey('Enter', undefined)).toBe(false)
    expect(activate).not.toHaveBeenCalled()
  })
})
