import { describe, it, expect, vi } from 'vitest'
import { createBigScreenAudio, createSettingsMemo, kioskSettings } from '../bigscreen/audio.js'
import type { Snapshot } from '../ws.js'

const dart = (score: number) => ({ score, segment: { multiplier: 1 } })
const x01 = (o: Record<string, unknown>) =>
  ({
    sessionId: 's',
    gameId: 'x01',
    status: 'active',
    scoreBased: true,
    game: {
      scores: [501, 501],
      legs: [0, 0],
      firstTo: 1,
      currentPlayer: 0,
      phase: 'game',
      bustThisVisit: false,
      visitLocked: false,
      currentVisitDarts: [],
      visitStartScores: [501, 501],
      totalVisits: [0, 0],
      config: { outMode: 'double' },
      ...o,
    },
  }) as unknown as Snapshot

function setup(prefs: Record<string, unknown>) {
  const caller = { say: vi.fn(), stop: vi.fn() }
  const sounds = { hit: vi.fn(), treble: vi.fn(), miss: vi.fn(), bust: vi.fn(), switchPlayer: vi.fn(), win: vi.fn() }
  const audio = createBigScreenAudio({ settings: kioskSettings(prefs), caller, sounds, loadClips: () => Promise.resolve({}) })
  return { caller, sounds, audio }
}

// Three darts landing is a visit over: the caller says its total once
const before = x01({ scores: [381, 501], currentVisitDarts: [dart(60), dart(60)] })
const after = x01({ scores: [321, 501], currentVisitDarts: [dart(60), dart(60), dart(60)] })

describe('big screen audio', () => {
  it('calls the visit once when the caller is on', () => {
    const { audio, caller } = setup({ callerOn: true })
    audio.onSnapshot(before, after)
    expect(caller.say).toHaveBeenCalledTimes(1)
  })
  it('is silent when the caller and sounds are off', () => {
    const { audio, caller, sounds } = setup({
      callerOn: false,
      soundHit: false,
      soundTreble: false,
      soundMiss: false,
      soundBust: false,
      soundSwitch: false,
    })
    audio.onSnapshot(before, after)
    expect(caller.say).not.toHaveBeenCalled()
    expect(Object.values(sounds).some(f => f.mock.calls.length)).toBe(false)
  })
  it('plays the hit tone for a dart', () => {
    const { audio, sounds } = setup({ callerOn: false, soundHit: true })
    audio.onSnapshot(x01({}), x01({ scores: [441, 501], currentVisitDarts: [dart(60)] }))
    expect(sounds.hit).toHaveBeenCalledTimes(1)
  })

  it('one instance keeps the checkout memory and never stops the caller between snapshots', () => {
    const { audio, caller } = setup({ callerOn: true, callerCheckouts: true, callerCheckoutRepeat: false })
    // Seat 1 sits on 40 (a checkout); seat 0 finishes a visit twice, so the checkout is announced for seat 1 once
    const visit = (n: number, p: number) =>
      x01({ scores: [301, 40], currentPlayer: p, totalVisits: [n, 0], currentVisitDarts: [], visitStartScores: [301, 40] })
    const start = x01({
      scores: [301, 40],
      currentPlayer: 0,
      totalVisits: [0, 0],
      visitStartScores: [301, 40],
      currentVisitDarts: [dart(0)],
    })
    audio.onSnapshot(start, visit(1, 1))
    audio.onSnapshot(visit(1, 1), visit(2, 1))
    const requireCalls = caller.say.mock.calls.filter(c => JSON.stringify(c[0]).includes('require_40'))
    expect(requireCalls).toHaveLength(1)
    expect(caller.stop).not.toHaveBeenCalled()
  })

  it('loads a custom voice for a signed-in user, the built-in fallback only for a kiosk', () => {
    const voiceFor = (kiosk: boolean) => {
      const loadClips = vi.fn((_voice: string | null) => Promise.resolve({}))
      createBigScreenAudio({ settings: { ...kioskSettings({ callerOn: true }), callerVoice: 'custom:mine' }, kiosk, loadClips })
      return loadClips.mock.calls[0]?.[0]
    }
    expect(voiceFor(false)).toBe('custom:mine')
    expect(voiceFor(true)).toBeNull()
  })

  it('the settings memo returns the same object for equal prefs', () => {
    const memo = createSettingsMemo()
    const a = memo(kioskSettings({ callerOn: true }))
    expect(memo(kioskSettings({ callerOn: true }))).toBe(a)
    expect(memo(kioskSettings({ callerOn: false }))).not.toBe(a)
  })
})
