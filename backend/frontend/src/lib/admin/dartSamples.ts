// The admin Dart samples page (`#/admin/dart-samples`): training data for the dart detection model
// (schema/api-v1.yaml, listAdminDartSamples, exportAdminDartSamples).
import { api, type AdminDartSamples, type DartSample, type DartSampleLabel } from '$lib/api'

export type { AdminDartSamples, DartSample, DartSampleLabel }

export async function loadSamples(opts: { label?: DartSampleLabel | null; before?: string }): Promise<AdminDartSamples | null> {
  const res = await api.GET('/api/admin/dart-samples', { params: { query: { label: opts.label ?? undefined, before: opts.before } } })
  return res.data ?? null
}

export const LABELS: { value: DartSampleLabel; text: string }[] = [
  { value: 'autodarts', text: 'Not corrected' },
  { value: 'corrected_spot', text: 'Moved on the board' },
  { value: 'corrected_segment', text: 'Corrected to a segment' },
]

export const labelText = (label: DartSampleLabel): string => LABELS.find(l => l.value === label)?.text ?? label

/**
 * Where a dart sits on a warped still, in percent from its top left: the bull is at the centre and
 * the outer double wire (r = 1) a third of the width out, 20 at the top (y up).
 */
export function markerAt(coords: { x: number; y: number }): { left: number; top: number } {
  return { left: 50 + (coords.x * 100) / 3, top: 50 - (coords.y * 100) / 3 }
}

export const stillUrl = (id: string, phase: 'before' | 'after', cam: number): string =>
  `/api/admin/dart-samples/${id}/stills/${phase}/${cam}`

/** The download of every settled sample after `after` (all of them without it), up to `upTo`. */
export function exportUrl(upTo: string, after: string | null, label: DartSampleLabel | null): string {
  const q = new URLSearchParams({ upTo })
  if (after) q.set('after', after)
  if (label) q.set('label', label)
  return `/api/admin/dart-samples/export?${q.toString()}`
}

// Where this admin's last download of a label (or of all) ended, so the next one fetches only what
// is new (this browser only). One cursor per label: a filtered download must not move the others.
const cursorKey = (label: DartSampleLabel | null): string => `dartcade.admin.dartSamples.downloadedUpTo.${label ?? 'all'}`

export function lastDownloaded(label: DartSampleLabel | null): string | null {
  try {
    return localStorage.getItem(cursorKey(label))
  } catch {
    return null
  }
}

export function rememberDownloaded(label: DartSampleLabel | null, upTo: string): void {
  try {
    localStorage.setItem(cursorKey(label), upTo)
  } catch {
    /* storage blocked: the next download starts from the beginning */
  }
}
