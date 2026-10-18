import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import NameField from '../components/NameField.svelte'
import { NAME_RULE, nameHint } from '../names'

describe('NameField', () => {
  it('links the input to its status line, for screen readers', () => {
    const html = render(NameField, { props: { id: 'reg-name', label: 'Name' } }).body
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toContain(`id="${describedBy}"`)
    // the status span, not the input itself
    expect(html).toMatch(new RegExp(`role="status" id="${describedBy}"|id="${describedBy}"[^>]*role="status"`))
  })

  it('shows the "@" prefix by default, but not when prefix is off', () => {
    const withPrefix = render(NameField, { props: { id: 'reg-name', label: 'Name' } }).body
    expect(withPrefix).toContain('>@<')
    const withoutPrefix = render(NameField, { props: { id: 'reg-name', label: 'Player name', prefix: false } }).body
    expect(withoutPrefix).not.toContain('>@<')
  })

  it('shows the name rules while the field is empty', () => {
    const html = render(NameField, { props: { id: 'reg-name', label: 'Player name', prefix: false } }).body
    expect(html).toContain(NAME_RULE)
  })

  it("Register's placeholder is itself a valid name", () => {
    expect(nameHint('OcheGhost')).toBeNull()
  })
})
