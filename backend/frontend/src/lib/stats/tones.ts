// The colours stats charts draw with, by meaning, as token classes (app.css @theme): `accent` is
// the subject (you, now), `won`/`lost` the darker bars of a leg chart, `muted` what it is compared
// with, `bad` a change for the worse. Literal class names, so Tailwind sees every one.

export type Tone = 'accent' | 'won' | 'lost' | 'muted' | 'bad'

export const TONE_FILL: Record<Tone, string> = {
  accent: 'fill-accent',
  won: 'fill-accent-line',
  lost: 'fill-line-3',
  muted: 'fill-text-muted',
  bad: 'fill-live',
}
export const TONE_STROKE: Record<Tone, string> = {
  accent: 'stroke-accent',
  won: 'stroke-accent-line',
  lost: 'stroke-line-3',
  muted: 'stroke-text-muted',
  bad: 'stroke-live',
}
export const TONE_BG: Record<Tone, string> = {
  accent: 'bg-accent',
  won: 'bg-accent-line',
  lost: 'bg-line-3',
  muted: 'bg-text-muted',
  bad: 'bg-live',
}
/** The token itself, for a chart series' colour. */
export const TONE_VAR: Record<Tone, string> = {
  accent: 'var(--color-accent)',
  won: 'var(--color-accent-line)',
  lost: 'var(--color-line-3)',
  muted: 'var(--color-text-muted)',
  bad: 'var(--color-live)',
}
