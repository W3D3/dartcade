// The Board Manager's status as a coloured dot (the Boards page and the match screen's board menu).

export type DotColor = 'green' | 'yellow' | 'purple' | 'red' | 'gray'

/** States that are on their way somewhere: the dot spins. */
export const SPINNING = new Set(['Starting', 'Stopping', 'Calibrating'])

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
