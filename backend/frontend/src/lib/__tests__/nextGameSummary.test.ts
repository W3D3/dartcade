// The lobby's next game: the big label is X01's start score, otherwise the mode's glyph
import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import type { Lobby } from '../api/lobby-ws'

vi.mock('$lib/api', () => ({ api: { GET: () => new Promise(() => {}) } }))
const { default: NextGameSummary } = await import('../components/lobby/NextGameSummary.svelte')

const lobby = (gameId: string, config: Record<string, unknown>) => ({ nextGame: { gameId, config }, people: [] }) as unknown as Lobby
const text = (html: string) =>
  html
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

describe('NextGameSummary', () => {
  it("shows 121's glyph, name and rules", () => {
    const config = { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double' }
    const body = text(render(NextGameSummary, { props: { lobby: lobby('p121', config), pickedBy: 'Host' } }).body)
    expect(body).toContain(' 121 ')
    expect(body).not.toContain('P121')
    expect(body).toContain('121 · 10 tries · 9 darts · Double out')
  })

  it("shows X01's start score and Minigolf's glyph", () => {
    expect(text(render(NextGameSummary, { props: { lobby: lobby('x01', { startScore: 301 }), pickedBy: 'Host' } }).body)).toContain(' 301 ')
    expect(text(render(NextGameSummary, { props: { lobby: lobby('minigolf', {}), pickedBy: 'Host' } }).body)).toContain('Par 3')
  })

  it("shows Higher Lower's glyph, name and rules", () => {
    const config = { startHigh: 41, startLow: 21, lives: 3 }
    const body = text(render(NextGameSummary, { props: { lobby: lobby('hilo', config), pickedBy: 'Host' } }).body)
    expect(body).toContain(' HiLo ')
    expect(body).toContain('Higher Lower')
    expect(body).toContain('41 / 21 · 3 lives')
  })
})
