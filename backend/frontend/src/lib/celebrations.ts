// Win celebrations (the `celebration.*` perks): what plays over the win screen for the winner, and
// over the card when one is tried on. canvas-confetti draws them, in the winner's card colours
// (the Legend in gold); nothing under reduced motion.
import type confetti from 'canvas-confetti'
import { accentOf, type CardColors } from './progress/look.js'

type Fire = confetti.CreateTypes
/** Starts a celebration on `fire`'s canvas; returns what stops it early. */
type Recipe = (fire: Fire, colors: string[]) => () => void

const GOLD = ['#f2c14e', '#fff3c4', '#d4a017', '#ffe08a']
const FIREWORKS_MS = 3000

function confettiBurst(fire: Fire, colors: string[]): () => void {
  void fire({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.5, y: 0.65 }, colors })
  void fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.75 }, colors })
  void fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.75 }, colors })
  return () => undefined
}

function fireworks(fire: Fire, colors: string[]): () => void {
  const burst = () =>
    void fire({
      particleCount: 45,
      spread: 360,
      startVelocity: 28,
      ticks: 70,
      gravity: 0.8,
      origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.35 },
      colors,
    })
  burst()
  const timer = setInterval(burst, 400)
  const end = setTimeout(() => clearInterval(timer), FIREWORKS_MS)
  return () => {
    clearInterval(timer)
    clearTimeout(end)
  }
}

/** Every celebration's recipe, by perk id; 'celebration.standard' adds nothing to the win screen. */
export const CELEBRATIONS: Record<string, Recipe> = {
  'celebration.confetti': confettiBurst,
  'celebration.fireworks': fireworks,
  'celebration.legend': fire => {
    const stop = fireworks(fire, GOLD)
    confettiBurst(fire, GOLD)
    return stop
  },
}

/** The colours a celebration is drawn in: the card's accent first (it reads on the dark screen), then the pair. */
export const celebrationColors = (c: CardColors): string[] => [accentOf(c), accentOf(c), c.fg, c.bg]

/** Plays celebration `id` on `fire`'s canvas; returns what stops it (nothing to stop for an unknown one). */
export function celebrate(fire: Fire, id: string, colors: CardColors): () => void {
  return id in CELEBRATIONS ? CELEBRATIONS[id](fire, celebrationColors(colors)) : () => undefined
}
