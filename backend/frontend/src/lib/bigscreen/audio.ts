// The big screen's sound: the caller's calls and the dart tones, decided from consecutive
// snapshots the way the match screen does (routes/GameDisplay.svelte), minus per-player sound packs.
import { callGame, callsFor, checkoutFor, createCheckoutMemory, requirePart, type Call } from '../caller/calls.js'
import { createCaller } from '../caller/player.js'
import { BUILTIN_PREFIX, voiceClips, type Clips } from '../caller/voices.js'
import { dartSound, snapshotEvent } from '../dartEvents.js'
import { defaultSettings, parseSettings, type GameSettings } from '../gameSettings.js'
import { audioAsleep, audioContext, createSounds } from '../sounds.js'
import type { Snapshot } from '../ws.js'

/** The kiosk's settings: the board owner's account settings over the defaults. */
export const kioskSettings = (prefs: Record<string, unknown>): GameSettings => parseSettings({ ...defaultSettings, ...prefs })

/** Returns the same object while the settings stay equal, so a message with unchanged prefs doesn't rebuild the audio. */
export function createSettingsMemo(): (s: GameSettings) => GameSettings {
  let key = ''
  let last: GameSettings | null = null
  return s => {
    const k = JSON.stringify(s)
    if (last === null || k !== key) {
      key = k
      last = s
    }
    return last
  }
}

export interface BigScreenAudioOptions {
  settings: GameSettings
  caller?: { say(call: Call, clips: Promise<Clips | null>, o?: { queue?: boolean }): unknown; stop(): void }
  sounds?: Pick<ReturnType<typeof createSounds>, 'hit' | 'treble' | 'miss' | 'bust' | 'switchPlayer' | 'win'>
  loadClips?: (voice: string | null) => Promise<Clips>
}

export function createBigScreenAudio(opts: BigScreenAudioOptions) {
  const { settings } = opts
  const caller = opts.caller ?? createCaller(() => settings.volume)
  const sounds = opts.sounds ?? createSounds(() => settings.effectsVolume)
  const load = opts.loadClips ?? voiceClips
  // shortcut: custom voice packs need the owner's session, so the kiosk uses the default built-in voice; upgrade with a token-scoped clip route
  const voice = settings.callerVoice?.startsWith(BUILTIN_PREFIX) ? settings.callerVoice : null
  // Loading starts at once so the first "Game on" isn't missed
  const clips: Promise<Clips | null> = settings.callerOn ? load(voice).catch(() => null) : Promise.resolve(null)
  let checkoutMemory = createCheckoutMemory()

  function playSounds(prev: Snapshot, next: Snapshot) {
    const e = snapshotEvent(prev, next)
    if (!e) return
    if (e.kind === 'switch') {
      if (settings.soundSwitch) sounds.switchPlayer()
      return
    }
    const sound = dartSound(e.kind, settings)
    if (sound === 'bust') sounds.bust()
    else if (sound === 'miss') sounds.miss()
    else if (sound === 'treble') sounds.treble()
    else if (sound) sounds.hit()
  }

  return {
    onSnapshot(prev: Snapshot | null, next: Snapshot) {
      const newSession = prev?.sessionId !== next.sessionId
      if (newSession) checkoutMemory = createCheckoutMemory()
      const nextCall = next.scoreBased && settings.callerOn ? callGame(next) : null
      if (nextCall) {
        const beforeCall = prev && !newSession ? callGame(prev) : null
        const call = callsFor(beforeCall, nextCall)
        // Only the require call at the takeout: the score call said at the third dart may still be playing
        const queue = !call.length
        const checkout = settings.callerCheckouts ? checkoutFor(beforeCall, nextCall) : null
        if (checkout && checkoutMemory(checkout, settings.callerCheckoutRepeat)) call.push(requirePart(checkout.remaining))
        if (call.length) void caller.say(call, clips, { queue })
      }
      if (!prev || newSession) return
      playSounds(prev, next)
      if (next.status === 'finished' && prev.status !== 'finished' && settings.soundWin) sounds.win()
    },
    /** True while the browser keeps audio asleep (nobody has tapped the page yet). */
    asleep: audioAsleep,
    wake() {
      audioContext()
    },
    destroy() {
      caller.stop()
    },
  }
}
