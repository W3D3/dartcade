import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import NameField from '../components/NameField.svelte'

describe('NameField', () => {
  it('links the input to its status line, for screen readers', () => {
    const html = render(NameField, { props: { id: 'reg-name', label: 'Name' } }).body
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toContain(`id="${describedBy}"`)
    // the status span, not the input itself
    expect(html).toMatch(new RegExp(`role="status" id="${describedBy}"|id="${describedBy}"[^>]*role="status"`))
  })
})
