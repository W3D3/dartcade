import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import Live from '../components/bigscreen/Live.svelte'
import WatchBar from '../components/watch/WatchBar.svelte'
import WatchingPill from '../components/watch/WatchingPill.svelte'
import { defaultSettings } from '../gameSettings'
import { emptyHistory } from '../visitHistory'
import { RESULT_SECONDS, watchingLabel, watchState, watchTitle } from '../watch/view'
import { parseSnapshot } from '../ws'
import fixture from './fixtures/x01-snapshot.json'

const snapshot = parseSnapshot(fixture)!

describe('watchState', () => {
  const active = { status: 'active' } as const
  it('waits for the first snapshot, then is live while the socket is open and offline while it reconnects', () => {
    expect(watchState(null, false, null)).toBe('connecting')
    expect(watchState(active, true, null)).toBe('live')
    expect(watchState(active, false, null)).toBe('offline')
  })
  it('is over once the game ended, even when the socket was closed by the server after that', () => {
    expect(watchState({ status: 'finished' }, true, null)).toBe('over')
    expect(watchState({ status: 'aborted' }, false, 'NotFound')).toBe('over')
  })
  it('is unavailable when refused, full when the game has its watchers', () => {
    expect(watchState(null, false, 'Forbidden')).toBe('unavailable')
    expect(watchState(null, false, 'NotFound')).toBe('unavailable')
    expect(watchState(null, false, 'TooManyWatchers')).toBe('full')
  })
  it('keeps the result up for a while', () => {
    expect(RESULT_SECONDS).toBeGreaterThan(0)
  })
})

describe('labels', () => {
  it('names the seats, and counts the watchers for the players', () => {
    expect(watchTitle({ players: [{ name: 'Lena' }, { name: 'Max' }] })).toBe('Lena vs Max')
    expect(watchTitle({ players: [{ name: 'Lena' }] })).toBe('Lena')
    expect(watchingLabel(0)).toBeNull()
    expect(watchingLabel(undefined)).toBeNull()
    expect(watchingLabel(3)).toBe('3 watching')
    expect(render(WatchingPill, { props: { count: 0 } }).body).not.toContain('watching')
    expect(render(WatchingPill, { props: { count: 2 } }).body).toContain('2 watching')
  })
})

describe('the watched game is view only', () => {
  it('shows who you are watching, with the one way out and nothing else to press', () => {
    const bar = render(WatchBar, {
      props: { title: 'Lena vs Max', game: 'X01', state: 'live', watchers: 2, onleave: () => undefined },
    }).body
    expect(bar).toContain('You are watching')
    expect(bar).toContain('Lena vs Max')
    expect(bar).toContain('LIVE')
    expect(bar).toContain('Stop watching')
    expect(bar.match(/<button/g)).toHaveLength(1)
  })

  it('draws the X01 match with nothing to act on: no Undo, Next or keypad, no dart to correct', () => {
    const html = render(Live, {
      props: { snapshot, board: { online: true }, settings: defaultSettings, history: emptyHistory(), bigHeader: false },
    }).body
    expect(html).toContain(snapshot.players[0].name)
    // Only the stats pager (looking, not acting) and the dart slots, which are disabled without a way to correct
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map(m => m[0])
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b.includes('Stats page') || b.includes('disabled=""')).toBe(true)
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('Undo')
    expect(html).not.toContain('Next player')
  })
})
