import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import LoadingBlock from '../components/LoadingBlock.svelte'
import { Spinner } from '../components/ui/spinner'

describe('Spinner', () => {
  it('is a polite status with a hidden label when it has one', () => {
    const html = render(Spinner, { props: { size: 'block', label: 'Loading games' } }).body
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<span class="sr-only">Loading games</span>')
  })

  it('is decoration without a label, and slows to a pulse under reduced motion', () => {
    const html = render(Spinner, { props: {} }).body
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="status"')
    expect(html).toContain('motion-reduce:animate-skeleton-soft')
  })

  it('draws 16, 24 and 40 pixels', () => {
    for (const [size, px] of [
      ['inline', 16],
      ['block', 24],
      ['page', 40],
    ] as const) {
      expect(render(Spinner, { props: { size } }).body).toContain(`width="${px}"`)
    }
  })
})

describe('LoadingBlock', () => {
  it('keeps its box busy but shows nothing before the delay', () => {
    const html = render(LoadingBlock, { props: { label: 'Loading games' } }).body
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('min-h-24')
    expect(html).not.toContain('Loading games')
  })

  it('shows its label as a status once the delay has passed', () => {
    const html = render(LoadingBlock, { props: { label: 'Loading games', times: { delay: 0 } } }).body
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading games')
  })

  it('says it is slow with a Retry once the timeout has passed', () => {
    const html = render(LoadingBlock, { props: { times: { delay: 0, timeout: 0 } } }).body
    expect(html).toContain('This is taking longer than usual.')
    expect(html).toContain('Retry')
  })

  it('draws skeleton rows for a list', () => {
    const html = render(LoadingBlock, { props: { rows: 3, times: { delay: 0 } } }).body
    expect(html.match(/(?<![:\w-])animate-skeleton(?![-\w])/g)).toHaveLength(3)
  })
})
