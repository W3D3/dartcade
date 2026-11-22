// The modes that end on a practice session summary instead of the win screen (121 Checkout, Catch 40).
import type { Snapshot } from './api/game-ws'

export const hasPracticeSummary = (s: Snapshot | null): boolean => s?.gameId === 'p121' || s?.gameId === 'catch40'
