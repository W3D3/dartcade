// What a screen says and plays when a new snapshot arrives, decided from the one before: shared by the match
// screen (routes/GameDisplay.svelte) and the big screen (lib/bigscreen/audio.ts).
import { dartSound, type DartEvent } from '../dartEvents.js'
import type { GameSettings } from '../gameSettings.js'
import type { createSounds } from '../sounds.js'
import type { Snapshot } from '../ws.js'
import { callGame, callsFor, checkoutFor, createCheckoutMemory, requirePart, type Call } from './calls.js'
import type { Clips } from './voices.js'

/** The caller's sequencing: what to say between two snapshots, and the checkout it already named. */
export function createSnapshotCaller(o: {
  settings: () => Pick<GameSettings, 'callerOn' | 'callerCheckouts' | 'callerCheckoutRepeat'>
  caller: { say(call: Call, clips: Promise<Clips | null>, o?: { queue?: boolean }): unknown }
  clips: () => Promise<Clips | null>
}) {
  let checkoutMemory = createCheckoutMemory()
  return {
    onSnapshot(prev: Snapshot | null, next: Snapshot) {
      const settings = o.settings()
      // A new session starts the caller afresh (the previous game isn't this one's "before"), and the checkout memory
      // too, even while the caller was off
      const newSession = prev?.sessionId !== next.sessionId
      if (newSession) checkoutMemory = createCheckoutMemory()
      const nextCall = next.scoreBased && settings.callerOn ? callGame(next) : null
      if (!nextCall) return
      const beforeCall = prev && !newSession ? callGame(prev) : null
      const call = callsFor(beforeCall, nextCall)
      // Only the require call at the takeout: the score call said at the third dart may still be playing
      const queue = !call.length
      const checkout = settings.callerCheckouts ? checkoutFor(beforeCall, nextCall) : null
      if (checkout && checkoutMemory(checkout, settings.callerCheckoutRepeat)) call.push(requirePart(checkout.remaining))
      if (call.length) void o.caller.say(call, o.clips(), { queue })
    },
  }
}

type DartSounds = Pick<ReturnType<typeof createSounds>, 'hit' | 'treble' | 'miss' | 'bust' | 'switchPlayer'>

/**
 * Plays the sound of a dart event. The switches decide whether a dart sounds and which; `pack` (a sound pack of
 * the thrower's or yours) may replace the beep: it returns true when it played the sound.
 */
export function playDartSound(
  e: DartEvent | null,
  settings: Parameters<typeof dartSound>[1] & { soundSwitch: boolean },
  sounds: DartSounds,
  pack?: (e: DartEvent, sound: NonNullable<ReturnType<typeof dartSound>>) => boolean,
) {
  if (!e) return
  if (e.kind === 'switch') {
    if (settings.soundSwitch) sounds.switchPlayer()
    return
  }
  const sound = dartSound(e.kind, settings)
  if (!sound || pack?.(e, sound)) return
  if (sound === 'bust') sounds.bust()
  else if (sound === 'miss') sounds.miss()
  else if (sound === 'treble') sounds.treble()
  else sounds.hit()
}
