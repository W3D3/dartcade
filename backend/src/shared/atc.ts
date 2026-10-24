/**
 * Where a hit on `sequence[idx]` takes an Around the Clock player: the index of their next
 * target, or `sequence.length` once they have won. `steps` is how many targets the dart moves
 * (its multiplier when multipliers advance). It walks the sequence itself, bull included, but
 * never skips a bull (21 = 25, 22 = bull): a multiplier stops on it, and it moves one target.
 */
export function nextTargetIndex(sequence: readonly number[], idx: number, steps: number): number {
  if (sequence[idx] > 20) return idx + 1
  const bull = sequence.findIndex((t, i) => i > idx && t > 20)
  return Math.min(idx + steps, bull === -1 ? sequence.length : bull)
}
