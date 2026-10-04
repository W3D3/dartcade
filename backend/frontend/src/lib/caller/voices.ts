// The caller's voices: the user's packs (on the server, per account) and the built-in ones
// (static files under /voices/<id>/). The server keeps the packs and their usage; this reads
// them, sends imports and turns manifests into clip URLs for the player.

import { writable } from 'svelte/store'
import { z } from 'zod'
import { api, type VoicePackImport, type VoicePackList, type VoicePackSummary } from '$lib/api'

/** The built-in voice missing keys fall back to, and the voice when none is picked. */
export const DEFAULT_BUILTIN = 'en-adam'
/** Built-in voices the app ships; each one shows once its manifest loads. */
const BUILTINS = [DEFAULT_BUILTIN]
export const BUILTIN_PREFIX = 'builtin:'

export type Clips = Record<string, string[]>
export type BuiltinVoice = { id: string; name: string }
export type VoiceLibrary = {
  packs: VoicePackSummary[]
  usage: VoicePackList['usage']
  builtins: BuiltinVoice[]
  /** The packs have been loaded at least once. */
  loaded: boolean
  /** Loading the packs failed; what to say. */
  error: string | null
}

export const voiceLibrary = writable<VoiceLibrary>({
  packs: [], usage: { bytes: 0, limitBytes: 0 }, builtins: [], loaded: false, error: null,
})

// ── URLs and manifests ────────────────────────────────────────────────────

export const clipUrl = (sha256: string) => `/api/voice-clips/${sha256}`

const mapClips = (clips: Clips, url: (file: string) => string): Clips =>
  Object.fromEntries(Object.entries(clips).map(([key, files]) => [key, files.map(url)]))

/** A pack's manifest (key → clip hashes) as clip URLs. */
export const packClipUrls = (clips: Clips): Clips => mapClips(clips, clipUrl)

/** A built-in manifest's file names (relative to its folder) as URLs. */
export const builtinClipUrls = (id: string, clips: Clips): Clips =>
  mapClips(clips, file => `/voices/${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`)

/** A voice's clips over the built-in voice's: keys the voice lacks fall back to it. */
export const mergeClips = (voice: Clips, base: Clips): Clips => ({ ...base, ...voice })

const BuiltinManifestSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  clips: z.record(z.string(), z.array(z.string().min(1))),
})
type BuiltinManifest = z.infer<typeof BuiltinManifestSchema>

const builtinManifests = new Map<string, Promise<BuiltinManifest | null>>()

/** A built-in voice's manifest, or null when it isn't there (not shipped yet, or not a manifest). */
function builtinManifest(id: string): Promise<BuiltinManifest | null> {
  const cached = builtinManifests.get(id)
  if (cached) return cached
  const load = (async () => {
    try {
      const res = await fetch(`/voices/${encodeURIComponent(id)}/manifest.json`)
      if (!res.ok) return null
      const parsed = BuiltinManifestSchema.safeParse(await res.json())
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  })()
  // Only a manifest that loaded is kept; a missing one is asked for again next time
  void load.then(m => { if (!m) builtinManifests.delete(id) })
  builtinManifests.set(id, load)
  return load
}

async function builtinClips(id: string): Promise<Clips> {
  const m = await builtinManifest(id)
  return m ? builtinClipUrls(id, m.clips) : {}
}

/**
 * The clip URLs per key for a voice (a pack id, `builtin:<id>`, or null for the default),
 * over the default built-in voice so missing keys fall back to it.
 */
export async function voiceClips(voice: string | null): Promise<Clips> {
  const base = await builtinClips(DEFAULT_BUILTIN)
  if (voice === null) return base
  if (voice.startsWith(BUILTIN_PREFIX)) {
    const id = voice.slice(BUILTIN_PREFIX.length)
    return id === DEFAULT_BUILTIN ? base : mergeClips(await builtinClips(id), base)
  }
  // A pack that can't be loaded (deleted, offline, a server error) leaves the built-in voice
  const pack = await packClips(voice)
  return pack ? mergeClips(pack, base) : base
}

/** One of the user's packs on its own (no built-in fallback), as clip URLs; null if it can't be loaded. */
export async function packClips(id: string): Promise<Clips | null> {
  try {
    const { data } = await api.GET('/api/voice-packs/{id}', { params: { path: { id } } })
    return data ? packClipUrls(data.clips) : null
  } catch {
    return null
  }
}

/** The key a pack's sample plays: 180 if it has it, else a score, else any key it has. */
export function sampleKey(clips: Clips): string | null {
  const keys = Object.keys(clips).filter(k => clips[k].length > 0)
  if (keys.includes('180')) return '180'
  return keys.find(k => /^\d+$/.test(k)) ?? keys.at(0) ?? null
}

// ── The library ───────────────────────────────────────────────────────────

let librarySeq = 0

/** Loads the user's packs and usage, and which built-in voices are there; only the newest load lands. */
export async function loadVoiceLibrary(): Promise<void> {
  const seq = ++librarySeq
  const builtinsP = Promise.all(BUILTINS.map(builtinManifest))
  try {
    const { data } = await api.GET('/api/voice-packs')
    const builtins = (await builtinsP).flatMap(m => m ? [{ id: m.id, name: m.name }] : [])
    if (seq !== librarySeq) return
    if (!data) { voiceLibrary.update(l => ({ ...l, builtins, error: "Your voices couldn't be loaded." })); return }
    voiceLibrary.set({ packs: data.packs, usage: data.usage, builtins, loaded: true, error: null })
  } catch {
    if (seq !== librarySeq) return
    voiceLibrary.update(l => ({ ...l, error: "Your voices couldn't be loaded. Check the connection." }))
  }
}

// ── Imports ───────────────────────────────────────────────────────────────

export type ImportOutcome = { kind: 'done'; pack: VoicePackImport } | { kind: 'error'; error: string } | { kind: 'cancelled' }

const ImportSchema: z.ZodType<VoicePackImport> = z.object({
  id: z.string(), name: z.string(), lang: z.string().nullable(), clips: z.number(), bytes: z.number(),
  createdAt: z.string(), total: z.number(),
})
const ErrorBodySchema = z.object({ error: z.string().min(1) })

/** What to say when an import fails: the server's own words, or one for the status. */
export function importErrorText(status: number, body: unknown): string {
  const parsed = ErrorBodySchema.safeParse(body)
  if (parsed.success) return parsed.data.error
  if (status === 0) return "The import didn't go through. Check the connection and try again."
  if (status === 413) return 'The zip is too large.'
  return `The import failed (${status}). Try again.`
}

/** "Kept 385 of 12,422 clips": the clips kept out of the sound files the source had. */
export const keptText = (p: Pick<VoicePackImport, 'clips' | 'total'>) =>
  `Kept ${p.clips.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} clips`

function parseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/**
 * Uploads a zip as a new pack. XMLHttpRequest rather than fetch, for the upload's progress
 * (0–1); aborting the signal cancels it. The library reloads once the server has the pack.
 */
export function uploadVoicePack(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<ImportOutcome> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve({ kind: 'cancelled' }); return }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/voice-packs?name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('content-type', 'application/zip')
    xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total) }
    const onAbort = () => { xhr.abort() }
    signal.addEventListener('abort', onAbort, { once: true })
    const finish = (outcome: ImportOutcome) => {
      signal.removeEventListener('abort', onAbort)
      if (outcome.kind === 'done') void loadVoiceLibrary()
      resolve(outcome)
    }
    xhr.onabort = () => { finish({ kind: 'cancelled' }) }
    xhr.onerror = () => { finish({ kind: 'error', error: importErrorText(0, null) }) }
    xhr.onload = () => {
      if (xhr.status === 401) { window.location.hash = '#/login'; finish({ kind: 'cancelled' }); return }
      const body = parseJson(xhr.responseText)
      const pack = ImportSchema.safeParse(body)
      if (xhr.status === 201 && pack.success) finish({ kind: 'done', pack: pack.data })
      else finish({ kind: 'error', error: importErrorText(xhr.status, body) })
    }
    xhr.send(file)
  })
}

/** Imports a pack from a darts-caller or Tools for Autodarts link; the server fetches it. */
export async function importVoicePackFromLink(url: string): Promise<ImportOutcome> {
  try {
    const { data, error, response } = await api.POST('/api/voice-packs/import', { body: { url } })
    if (data) { void loadVoiceLibrary(); return { kind: 'done', pack: data } }
    return { kind: 'error', error: importErrorText(response.status, error) }
  } catch {
    return { kind: 'error', error: importErrorText(0, null) }
  }
}

/** Removes one of the user's packs; null when it's gone, or what went wrong. */
export async function deleteVoicePack(id: string): Promise<string | null> {
  try {
    const { response } = await api.DELETE('/api/voice-packs/{id}', { params: { path: { id } } })
    // Gone already (another device) counts as removed
    if (!response.ok && response.status !== 404) return `The voice couldn't be deleted (${response.status}).`
    await loadVoiceLibrary()
    return null
  } catch {
    return "The voice couldn't be deleted. Check the connection."
  }
}

// ── Storage ───────────────────────────────────────────────────────────────

const MiB = 1024 * 1024

/** Bytes as MB with one decimal at most ("2.6", "50"); "<0.1" for a little above nothing. */
export function formatMB(bytes: number): string {
  if (bytes <= 0) return '0'
  const mb = bytes / MiB
  if (mb < 0.05) return '<0.1'
  return String(Math.round(mb * 10) / 10)
}

/** The storage bar: used, limit and what's left in MB, and the bar's fill (a sliver for anything stored). */
export function storageUse(u: VoicePackList['usage']) {
  const percent = u.limitBytes > 0 ? Math.min(100, (u.bytes / u.limitBytes) * 100) : 0
  return {
    used: formatMB(u.bytes),
    limit: formatMB(u.limitBytes),
    left: formatMB(Math.max(0, u.limitBytes - u.bytes)),
    percent: u.bytes > 0 && u.limitBytes > 0 ? Math.max(percent, 1) : percent,
  }
}
