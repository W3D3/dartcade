// The Board Manager's status as a coloured dot (the Boards page and the match screen's board menu).
import type { BoardStatus } from '$lib/api'

export type DotColor = 'green' | 'yellow' | 'purple' | 'red' | 'gray'

/** States that are on their way somewhere: the dot is replaced by a spinner. */
export const SPINNING = new Set(['Starting', 'Stopping'])

/** States that are busy but still tell their colour: a ring turns around the dot. */
export const RINGED = new Set(['Takeout in progress', 'Calibrating'])

/** The status of a board whose bridge is online but cannot get an answer from its Board Manager: commands can't work. */
export const NOT_REACHABLE = 'Board Manager not reachable'
const UNREACHABLE: BoardStatus = { status: NOT_REACHABLE, running: false, event: null }

/**
 * What a status poll shows: Board Manager's status, NOT_REACHABLE when the bridge could not reach it (502) or
 * did not answer in time (503), null when nothing is known.
 */
export const polledStatus = (data: BoardStatus | undefined, httpStatus: number): BoardStatus | null =>
  data ?? (httpStatus === 502 || httpStatus === 503 ? UNREACHABLE : null)

/** What the dot shows: NOT_REACHABLE once the bridge says it lost its Board Manager (Board.bmReachable), else the last poll. */
export const shownStatus = (polled: BoardStatus | null, bmReachable: boolean | null): BoardStatus | null =>
  bmReachable === false ? UNREACHABLE : polled

/** The toast for a Board Manager command (Start, Stop, Reset, Calibrate) that failed with this HTTP status. */
export function commandError(httpStatus: number | undefined): string {
  if (httpStatus === 502) return 'The Board Manager did not do it. Is it running? Check the board, then try again.'
  if (httpStatus === 503) return "The board's bridge did not answer. If it keeps happening, restart the bridge."
  return 'That did not work, try again.'
}

/** Green: detecting darts; yellow: takeout or stopping; purple: setting up; red: stopped; gray: offline or unknown. */
export function bmDotColor(status: string | null, online: boolean): DotColor {
  if (!online) return 'gray'
  switch (status) {
    case 'Running':
    case 'Throw':
    case 'Starting':
      return 'green'
    case 'Takeout':
    case 'Takeout in progress':
    case 'Stopping':
      return 'yellow'
    case 'Calibrating':
    case 'Setup':
      return 'purple'
    case 'Stopped':
    case 'Error':
    case 'Offline':
    case NOT_REACHABLE:
      return 'red'
    default:
      return 'gray'
  }
}

export const DOT_BG: Record<DotColor, string> = {
  green: 'bg-bm-green',
  yellow: 'bg-bm-yellow',
  purple: 'bg-bm-purple',
  red: 'bg-bm-red',
  gray: 'bg-bm-gray',
}

export const DOT_TEXT: Record<DotColor, string> = {
  green: 'text-bm-green',
  yellow: 'text-bm-yellow',
  purple: 'text-bm-purple',
  red: 'text-bm-red',
  gray: 'text-bm-gray',
}

/** What the status dot's label says: Board Manager's status, a dash while an online board has none yet, "Offline" otherwise. */
export const bmStatusLabel = (status: string | null, online: boolean): string => status ?? (online ? '—' : 'Offline')

/** The label for tight bars (the big screen's header): "Takeout in progress" is just "Takeout", the ring says the rest. */
export const bmShortLabel = (status: string | null, online: boolean): string => bmStatusLabel(status, online).replace(' in progress', '')
