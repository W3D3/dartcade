import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// No DOM in this suite: lock the attributes password managers read in the markup itself.
const input = (file: string, id: string) => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8')
  const m = src.match(new RegExp(`<Input[^>]*?id="${id}"[^>]*?/>`, 's'))
  if (!m) throw new Error(`no input ${id} in ${file}`)
  return m[0]
}

describe('auth form fields', () => {
  it('register: email is an email, the name is a nickname, passwords are new', () => {
    const email = input('./Register.svelte', 'reg-email')
    expect(email).toContain('type="email"')
    expect(email).toContain('name="email"')
    expect(email).toContain('autocomplete="email"')
    const nameField = readFileSync(new URL('../lib/components/NameField.svelte', import.meta.url), 'utf8')
    expect(nameField).toContain('name="nickname"')
    expect(nameField).toContain('autocomplete="nickname"')
    expect(input('./Register.svelte', 'reg-password')).toContain('autocomplete="new-password"')
  })

  it('sign-in: the email is the username (#326)', () => {
    const email = input('./Login.svelte', 'login-email')
    expect(email).toContain('type="email"')
    expect(email).toContain('autocomplete="username"')
    expect(input('./Login.svelte', 'login-password')).toContain('autocomplete="current-password"')
  })
})
