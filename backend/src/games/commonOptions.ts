import type { ConfigFieldMeta } from '../session/types.js'

export const BULL_OFF_OPTION: ConfigFieldMeta = {
  label: 'Bull off',
  tooltip:
    'Who throws first. Off: player 1 starts. One dart each, closest to the bull goes first. The same bull segment twice is thrown again. If nobody hits a bull, WDC measures the distance and PDC throws again.',
  options: [
    { value: 'off', label: 'Off' },
    { value: 'wdc', label: 'WDC' },
    { value: 'pdc', label: 'PDC' },
  ],
}

export const BOT_SPEED_OPTION: ConfigFieldMeta = {
  label: 'Bot speed',
  tooltip: 'How fast a bot seat throws its darts.',
  options: [
    { value: 'fast', label: 'Fast' },
    { value: 'normal', label: 'Normal' },
    { value: 'slow', label: 'Slow' },
  ],
}

export const OUT_MODE_OPTION: ConfigFieldMeta = {
  label: 'Check-out',
  tooltip: 'How a player finishes. Straight: any dart on 0. Double: must finish on a double. Master: double or triple.',
  options: [
    { value: 'straight', label: 'Straight' },
    { value: 'double', label: 'Double' },
    { value: 'master', label: 'Master' },
  ],
}
