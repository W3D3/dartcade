import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import GroupingPill from '../components/coach/GroupingPill.svelte'

describe('GroupingPill', () => {
  it('shows the comment for a tight or scattered group', () => {
    expect(render(GroupingPill, { props: { grouping: { comment: { level: 'great', text: 'Great grouping' } } } }).body).toContain(
      'Great grouping',
    )
    expect(render(GroupingPill, { props: { grouping: { comment: { level: 'scattered', text: 'Scattered' } } } }).body).toContain(
      'Scattered',
    )
  })

  it('renders nothing without a comment worth showing', () => {
    expect(render(GroupingPill, { props: { grouping: { comment: null } } }).body).not.toContain('<span')
    expect(render(GroupingPill, { props: { grouping: null } }).body).not.toContain('<span')
  })
})
