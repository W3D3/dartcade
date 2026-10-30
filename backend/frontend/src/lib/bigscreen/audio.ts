// The big screen's sound: the caller's calls and the dart tones, decided from consecutive snapshots by the
// same code as the match screen (caller/snapshotCaller.ts), minus per-player sound packs.
import { createSnapshotCaller, playDartSound } from '../caller/snapshotCaller.js'
import { createCaller } from '../caller/player.js'
import { BUILTIN_PREFIX, voiceClips, type Clips } from '../caller/voices.js'
import { snapshotEvent } from '../dartEvents.js'
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
  caller?: Parameters<typeof createSnapshotCaller>[0]['caller'] & { stop(): void }
  sounds?: Pick<ReturnType<typeof createSounds>, 'hit' | 'treble' | 'miss' | 'bust' | 'switchPlayer'>
  loadClips?: (voice: string | null) => Promise<Clips>
  /** No signed-in user here (a kiosk): custom voice packs cannot be fetched. */
  kiosk?: boolean
}

export function createBigScreenAudio(opts: BigScreenAudioOptions) {
  const { settings } = opts
  const caller = opts.caller ?? createCaller(() => settings.volume)
  const sounds = opts.sounds ?? createSounds(() => settings.effectsVolume)
  const load = opts.loadClips ?? voiceClips
  // shortcut: custom voice packs need the owner's session, so the kiosk uses the default built-in voice; upgrade with a token-scoped clip route
  const voice = !opts.kiosk || settings.callerVoice?.startsWith(BUILTIN_PREFIX) ? (settings.callerVoice ?? null) : null
  // Loading starts at once so the first "Game on" isn't missed
  const clips: Promise<Clips | null> = settings.callerOn ? load(voice).catch(() => null) : Promise.resolve(null)
  const snapshotCaller = createSnapshotCaller({ settings: () => settings, caller, clips: () => clips })

  return {
    onSnapshot(prev: Snapshot | null, next: Snapshot) {
      snapshotCaller.onSnapshot(prev, next)
      if (!prev || prev.sessionId !== next.sessionId) return
      playDartSound(snapshotEvent(prev, next), settings, sounds)
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
