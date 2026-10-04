// Voice packs from a link: a darts-caller zip, or a Tools for Autodarts style folder of clips.
// The server fetches URLs a user typed in, so only HTTPS to a few known hosts (exact names, default
// port), redirects checked by hand and kept on the same host, a byte cap and a timeout.
// Design: docs/superpowers/specs/2026-10-04-caller-voice-packs-design.md
//
// Known limit: the host is checked by name and the address it resolves to isn't pinned, so a DNS
// record of one of these hosts pointing at an internal address (DNS rebinding) would be followed.
// Fine for three fixed public hosts; if it ever matters, pass an undici Agent whose `connect.lookup`
// refuses private and loopback addresses (fetch's `dispatcher` option).

import { readPack, keyFromName, packName, isCallerKey, type Clip, type ParsedPack } from './pack.js'

/** The hosts packs may be imported from: darts-caller's downloads and Tools for Autodarts' sound hosts. */
export const ALLOWED_HOSTS: readonly string[] = ['darts-downloads.peschi.org', 'autodarts.x10.mx', 'adt-socket.tobias-thiele.de']

/** A link that can't be imported; the message is shown to the user. */
export class LinkError extends Error {}

export type FetchPackOptions = {
  /** Per folder probe, headers and body together (default 60 s). */
  timeoutMs?: number
  /** For a zip link's download, headers and body together (default 5 min: a darts-caller pack is about 60 MB). */
  zipTimeoutMs?: number
  /** For all of a folder link's probes together (default 5 min). */
  folderDeadlineMs?: number
}

/** The most a link may download, a zip or all of a folder's clips together. */
const MAX_BYTES = 128 * 1024 * 1024
const MAX_REDIRECTS = 3
/** Folder probes at once. */
const PARALLEL = 6

/** The names a folder is probed for (it has no listing), each as .mp3 then .wav. */
const FOLDER_NAMES = [
  ...Array.from({ length: 181 }, (_, i) => String(i)),
  'gameshot', 'game on', 'gameon', 'busted', 'matchshot',
]
const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav' }

const UNSUPPORTED = "Links from this site aren't supported"

function allowed(url: URL): boolean {
  return url.protocol === 'https:' && ALLOWED_HOSTS.includes(url.hostname)
    && url.port === '' && url.username === '' && url.password === ''
}

/** Reads the pack a link points at. Throws a LinkError (or a ZipError for a broken zip). */
export async function fetchPack(link: string, fetchImpl: typeof fetch = fetch, opts: FetchPackOptions = {}): Promise<ParsedPack> {
  let url: URL
  try { url = new URL(link) } catch { throw new LinkError(UNSUPPORTED) }
  if (!allowed(url)) throw new LinkError(UNSUPPORTED)

  const segments = url.pathname.split('/').filter(s => s !== '').map(safeDecode)
  const last = segments.at(-1) ?? url.hostname

  if (/\.zip$/i.test(last)) {
    const client = new Client(fetchImpl, opts.zipTimeoutMs ?? 5 * 60_000)
    const bytes = await client.get(url)
    if (bytes === null) throw new LinkError(`Nothing found at that link (HTTP ${client.lastStatus})`)
    return readPack(bytes, last)
  }
  return probeFolder(new Client(fetchImpl, opts.timeoutMs ?? 60_000), url, last, opts.folderDeadlineMs ?? 5 * 60_000)
}

async function probeFolder(client: Client, url: URL, name: string, deadlineMs: number): Promise<ParsedPack> {
  const base = new URL(url.href)
  base.search = ''
  base.hash = ''
  if (!base.pathname.endsWith('/')) base.pathname += '/'

  const found: { file: string; clip: Clip }[][] = FOLDER_NAMES.map(() => [])
  // Stops every probe: at the deadline, or when one probe fails (the import fails with it)
  const stop = new AbortController()
  const deadline = setTimeout(() => stop.abort(new LinkError('That site took too long')), deadlineMs)
  let next = 0
  async function worker(): Promise<void> {
    while (!stop.signal.aborted && next < FOLDER_NAMES.length) {
      const i = next++
      for (const ext of ['mp3', 'wav'] as const) {
        const file = `${FOLDER_NAMES[i]}.${ext}`
        let bytes: Uint8Array | null
        try { bytes = await client.get(new URL(encodeURIComponent(file), base), { skipHtml: true, signal: stop.signal }) }
        catch (err) { stop.abort(err); throw err }
        if (bytes !== null) { found[i].push({ file, clip: { bytes, mime: MIME[ext] } }); break }
      }
    }
  }
  try { await Promise.all(Array.from({ length: PARALLEL }, worker)) }
  finally { clearTimeout(deadline) }

  const clips: Record<string, Clip[]> = {}
  let total = 0
  for (const { file, clip } of found.flat()) {
    total++
    const key = keyFromName(file)
    if (isCallerKey(key)) (clips[key] ??= []).push(clip)
  }
  if (total === 0) throw new LinkError('No caller clips found at that link')
  return { ...packName(name), total, clips }
}

/** GETs on the allowed hosts, sharing one byte budget. */
class Client {
  private bytes = 0
  lastStatus = 0

  constructor(private readonly fetchImpl: typeof fetch, private readonly timeoutMs: number) {}

  /**
   * The body, or null when there's nothing there (any status but 2xx and 3xx; an HTML page with
   * skipHtml). Gives up after the timeout, or when `signal` aborts (with its reason if a LinkError).
   */
  async get(start: URL, { skipHtml = false, signal: outer }: { skipHtml?: boolean; signal?: AbortSignal } = {}): Promise<Uint8Array | null> {
    const own = new AbortController()
    const timer = setTimeout(() => own.abort(new LinkError("That site didn't answer")), this.timeoutMs)
    const signal = outer ? AbortSignal.any([outer, own.signal]) : own.signal
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => reject(abortError(signal))
      if (signal.aborted) fail()
      else signal.addEventListener('abort', fail, { once: true })
    })
    aborted.catch(() => {})  // Rejects only after the request is done with when it isn't raced
    try {
      let url = start
      for (let hop = 0; ; hop++) {
        const res = await Promise.race([this.request(url, signal), aborted])
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel().catch(() => {})
          const location = res.headers.get('location')
          if (location === null) throw new LinkError(`That link redirects without saying where (HTTP ${res.status})`)
          if (hop === MAX_REDIRECTS) throw new LinkError('That link redirects too often')
          let to: URL
          try { to = new URL(location, url) } catch { throw new LinkError("That link leads somewhere we can't follow") }
          if (!allowed(to) || to.hostname !== url.hostname) throw new LinkError("That link leads to another site, which isn't supported")
          url = to
          continue
        }
        this.lastStatus = res.status
        if (!res.ok || (skipHtml && (res.headers.get('content-type') ?? '').startsWith('text/html'))) {
          await res.body?.cancel().catch(() => {})
          return null
        }
        return await Promise.race([this.read(res, signal), aborted])
      }
    } finally {
      clearTimeout(timer)
      own.abort()
    }
  }

  private async request(url: URL, signal: AbortSignal): Promise<Response> {
    try {
      return await this.fetchImpl(url.href, { redirect: 'manual', signal, credentials: 'omit' })
    } catch {
      // The error's text (addresses, TLS details) stays on the server
      if (signal.aborted) throw abortError(signal)
      throw new LinkError("Couldn't reach that site")
    }
  }

  private async read(res: Response, signal: AbortSignal): Promise<Uint8Array> {
    const length = Number(res.headers.get('content-length'))
    if (Number.isFinite(length) && this.bytes + length > MAX_BYTES) {
      await res.body?.cancel().catch(() => {})
      throw new LinkError('That file is too big')
    }
    if (!res.body) return new Uint8Array(0)
    const reader = res.body.getReader()
    // A body that stops coming is dropped when the time is up (the race has already given up on it)
    signal.addEventListener('abort', () => { reader.cancel().catch(() => {}) }, { once: true })
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        this.bytes += value.length
        if (this.bytes > MAX_BYTES) throw new LinkError('That file is too big')
        chunks.push(value)
      }
    } catch (err) {
      await reader.cancel().catch(() => {})
      if (err instanceof LinkError) throw err
      throw new LinkError("Couldn't download that link")
    }
    const out = new Uint8Array(size)
    let at = 0
    for (const c of chunks) { out.set(c, at); at += c.length }
    return out
  }
}

/** Why a request was stopped, for the user: the signal's LinkError reason, or a timeout. */
function abortError(signal: AbortSignal): LinkError {
  return signal.reason instanceof LinkError ? signal.reason : new LinkError("That site didn't answer")
}

function safeDecode(segment: string): string {
  try { return decodeURIComponent(segment) } catch { return segment }
}
