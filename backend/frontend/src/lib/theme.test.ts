import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME } from './theme'

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
const token = (name: string) => css.match(new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i'))?.[1]

describe('THEME', () => {
  it('mirrors the @theme colours in app.css', () => {
    expect(THEME).toEqual({
      bg: token('bg'),
      text: token('text'),
      accent: token('accent'),
      accentHover: token('accent-hover'),
      boardRed: token('board-red'),
      boardGreen: token('board-green'),
      boardCream: token('board-cream'),
    })
  })
})
