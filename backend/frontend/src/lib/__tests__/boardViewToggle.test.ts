import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { SeatInfo, Snapshot } from '$lib/api/game-ws'
import BoardViewToggle from '../components/BoardViewToggle.svelte'
import { defaultSettings, type GameSettings } from '../gameSettings.js'
import fixture from './fixtures/x01-snapshot.json'

// Christoph on board-a; `currentPlayer` is up (see camera.test.ts for the same shape)
const snap = (seats: Partial<SeatInfo>[] = [{}]): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  return {
    ...base,
    seats: [{ ...base.seats[0], boardId: 'board-a', boardOnline: true, ...seats[0] }, base.seats[1]],
    game: { ...base.game, currentPlayer: 0 },
  } as Snapshot
}
const versions = { 'board-a:0': 1, 'board-a:1': 2, 'board-a:3': 3 }

const html = (settings: Partial<GameSettings> = {}, opts: { snapshot?: Snapshot | null; cameraVersions?: Record<string, number> } = {}) =>
  render(BoardViewToggle, {
    props: {
      settings: { ...defaultSettings, ...settings },
      snapshot: opts.snapshot !== undefined ? opts.snapshot : snap(),
      cameraVersions: opts.cameraVersions ?? versions,
    },
  }).body

describe('BoardViewToggle', () => {
  it('shows Drawn and Combined when the board is drawn and nothing was picked yet', () => {
    const out = html({ boardView: 'svg', lastCameraView: 'combined' })
    expect(out).toContain('role="radiogroup"')
    expect(out).toContain('>Drawn<')
    expect(out).toContain('>Combined<')
    expect(out).toMatch(/aria-label="Drawn board"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Drawn board"/)
  })

  it("shows the camera's own name instead of Combined when a single camera is picked", () => {
    const out = html({ boardView: 'cam2', lastCameraView: 'combined' })
    expect(out).toContain('>Cam 2<')
    expect(out).not.toContain('>Combined<')
  })

  it('checks the camera side, not Drawn, once a camera is picked', () => {
    const out = html({ boardView: 'cam2', lastCameraView: 'combined' })
    const camBtn = /<button[^>]*aria-label="Cam 2 camera"[^>]*>/.exec(out)?.[0] ?? ''
    const drawnBtn = /<button[^>]*aria-label="Drawn board"[^>]*>/.exec(out)?.[0] ?? ''
    expect(camBtn).toContain('aria-checked="true"')
    expect(drawnBtn).toContain('aria-checked="false"')
  })

  it('is hidden when no still could be shown (board offline)', () => {
    const out = html({ boardView: 'svg', lastCameraView: 'combined' }, { snapshot: snap([{ boardOnline: false }]) })
    expect(out).not.toContain('role="radiogroup"')
  })

  it('is hidden without a snapshot', () => {
    const out = html({ boardView: 'svg', lastCameraView: 'combined' }, { snapshot: null })
    expect(out).not.toContain('role="radiogroup"')
  })

  it('is hidden before that camera has sent a still', () => {
    const out = html({ boardView: 'svg', lastCameraView: 'cam1' }, { cameraVersions: {} })
    expect(out).not.toContain('role="radiogroup"')
  })
})
