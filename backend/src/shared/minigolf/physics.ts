// How the ball feels. Kept apart from holes so the test bench can change it live.

export interface Physics {
  /** Rolling friction: constant deceleration, mm/s². */
  friction: number
  /** Below this speed (mm/s) the ball stops, unless a slope is stronger than friction. */
  restSpeed: number
  /** The cup's pull towards its middle while the ball is over it (its edge slopes in), mm/s². */
  cupPull: number
  /** How long the ball must stay over the cup to fall in, s: a fast ball, or one clipping the rim
   *  (a shorter way across), escapes first. */
  dropTime: number
  /** How far a full-power putt rolls on flat felt, mm. Power is a share of this distance, so the
   *  distance from the bull maps linearly to how far the ball rolls. */
  maxRoll: number
  /** Power of a dart at the very centre, 0..1: the softest putt. */
  minPutt: number
  wallRestitution: number
  bumperRestitution: number
  /** How distance from the bull maps to power: power grows with distance^powerExponent (1: linear;
   *  higher keeps short putts further from the bull, where the angle is easier to hit). */
  powerExponent: number
  /** Fixed simulation step, s. */
  step: number
  /** A shot stops where it is after this long, s. */
  maxTime: number
  /** Rails and walls are this thick, mm. */
  wallThickness: number
  /** Aim assist: a putt within this many degrees of a clear line to the cup is pulled onto it. */
  assistAngle: number
  /** Aim assist only near the cup: full strength within half this distance (mm), none beyond it. */
  assistRange: number
}

export const DEFAULT_PHYSICS: Physics = {
  friction: 1200,
  restSpeed: 8,
  cupPull: 6000,
  dropTime: 0.045,
  maxRoll: 4500,
  minPutt: 0.05,
  wallRestitution: 0.7,
  bumperRestitution: 0.85,
  powerExponent: 2,
  step: 1 / 240,
  maxTime: 20,
  wallThickness: 20,
  assistAngle: 10,
  assistRange: 600,
}
