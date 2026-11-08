import { expect, it } from 'vitest'
import { cn } from './utils'

it('keeps a type token next to a text colour, and lets the later size win', () => {
  expect(cn('text-small text-ink')).toBe('text-small text-ink')
  expect(cn('text-small', 'text-[15px]')).toBe('text-[15px]')
  expect(cn('text-[15px]', 'text-body')).toBe('text-body')
})

it('treats radius tokens as one group', () => {
  expect(cn('rounded-card', 'rounded-[3px]')).toBe('rounded-[3px]')
  expect(cn('rounded-sm rounded-t-popover')).toBe('rounded-sm rounded-t-popover')
  expect(cn('rounded-md', 'rounded-panel')).toBe('rounded-panel')
})

it('knows every type, radius and tracking token in app.css', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
  const names = (re: RegExp) => [...css.matchAll(re)].map(m => m[1])
  for (const n of names(/--text-([a-z-]+?):\s*\d+px;/g)) expect(cn(`text-${n} text-ink`)).toBe(`text-${n} text-ink`)
  for (const n of names(/--radius-([a-z]+):/g)) expect(cn(`rounded-${n}`, 'rounded-[3px]')).toBe('rounded-[3px]')
  for (const n of names(/--tracking-([a-z]+):/g)) expect(cn(`tracking-${n}`, 'tracking-[3px]')).toBe('tracking-[3px]')
})
