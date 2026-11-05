import { describe, it, expect } from 'vitest'
import { nextPage, pageAt } from '../statPages.js'

describe('stat pages', () => {
  it('a click turns the page and wraps to the first', () => {
    expect([nextPage(0, 2), nextPage(1, 2), nextPage(0, 1)]).toEqual([1, 0, 0])
  })
  it('the page is the scroll position, rounded to the nearest page and kept in range', () => {
    expect([pageAt(0, 60, 2), pageAt(25, 60, 2), pageAt(40, 60, 2), pageAt(60, 60, 2), pageAt(500, 60, 2), pageAt(10, 0, 2)]).toEqual([
      0, 0, 1, 1, 1, 0,
    ])
  })
})
