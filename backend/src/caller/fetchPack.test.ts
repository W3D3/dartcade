import { describe, it, expect, vi } from 'vitest'
import { fetchPack, LinkError } from './fetchPack.js'
import { ZipError } from './zip.js'
import { makeZip } from './zipFixture.js'

const MiB = 1024 * 1024
// A copy on its own ArrayBuffer, which is what a Response body takes
const zip = makeZip([{ name: '180.mp3', data: 'one-eighty' }, { name: 'murmel.mp3', data: 'murmel' }]).slice()

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
/** A fetch that answers from the handler and records the URLs asked for. */
function fakeFetch(handler: Handler) {
  const calls: string[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    return handler(url, init)
  })
  return { impl, calls }
}

const notFound = () => new Response('nope', { status: 404 })

async function linkError(p: Promise<unknown>): Promise<string> {
  const err = await p.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(LinkError)
  return err instanceof Error ? err.message : ''
}

describe('fetchPack', () => {
  it('refuses plain http, hosts off the list and IPs without asking anyone', async () => {
    const { impl } = fakeFetch(() => new Response(zip))
    for (const url of [
      'http://darts-downloads.peschi.org/soundfiles/x.zip',
      'https://evil.example/x.zip',
      'https://darts-downloads.peschi.org.evil.example/x.zip',
      'https://evil.darts-downloads.peschi.org/x.zip',
      'https://127.0.0.1/x.zip',
      'https://[::1]/x.zip',
      'https://darts-downloads.peschi.org:8443/x.zip',
      'https://user:pw@darts-downloads.peschi.org/x.zip',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(await linkError(fetchPack(url, impl))).toBe("Links from this site aren't supported")
    }
    expect(impl).not.toHaveBeenCalled()
  })

  it('downloads a zip link and reads it', async () => {
    const { impl, calls } = fakeFetch(() => new Response(zip, { headers: { 'content-type': 'application/zip' } }))
    const pack = await fetchPack('https://darts-downloads.peschi.org/soundfiles/en-GB-Arthur-Male-v4.zip', impl)
    expect(calls).toEqual(['https://darts-downloads.peschi.org/soundfiles/en-GB-Arthur-Male-v4.zip'])
    expect(impl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(pack.name).toBe('en-GB Arthur (Male)')
    expect(pack.lang).toBe('en-GB')
    expect(pack.total).toBe(2)
    expect(Object.keys(pack.clips)).toEqual(['180'])
    expect(new TextDecoder().decode(pack.clips['180'][0].bytes)).toBe('one-eighty')
  })

  it('passes a broken zip on as a ZipError and a failed download as a LinkError', async () => {
    expect(await fetchPack('https://darts-downloads.peschi.org/x.zip', fakeFetch(() => new Response('hello')).impl)
      .catch((e: unknown) => e)).toBeInstanceOf(ZipError)
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', fakeFetch(notFound).impl)))
      .toBe('Nothing found at that link (HTTP 404)')
  })

  it('refuses a redirect to another host', async () => {
    const { impl, calls } = fakeFetch(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.zip' } }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl))).toBe("That link leads to another site, which isn't supported")
    expect(calls).toHaveLength(1)
  })

  it('refuses a redirect to plain http on the same host', async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 301, headers: { location: 'http://darts-downloads.peschi.org/x.zip' } }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl))).toBe("That link leads to another site, which isn't supported")
  })

  it('refuses a redirect it can\'t follow', async () => {
    const malformed = fakeFetch(() => new Response(null, { status: 302, headers: { location: 'https://[' } }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', malformed.impl))).toBe("That link leads somewhere we can't follow")
    const nowhere = fakeFetch(() => new Response(null, { status: 302 }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', nowhere.impl))).toBe('That link redirects without saying where (HTTP 302)')
  })

  it('follows a redirect on the same host, at most 3', async () => {
    const hops = fakeFetch(url => url.endsWith('/c.zip')
      ? new Response(zip)
      : new Response(null, { status: 302, headers: { location: url.endsWith('/a.zip') ? '/b.zip' : 'c.zip' } }))
    await fetchPack('https://darts-downloads.peschi.org/a.zip', hops.impl)
    expect(hops.calls).toEqual([
      'https://darts-downloads.peschi.org/a.zip', 'https://darts-downloads.peschi.org/b.zip', 'https://darts-downloads.peschi.org/c.zip',
    ])

    const loop = fakeFetch(() => new Response(null, { status: 302, headers: { location: '/again.zip' } }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/a.zip', loop.impl))).toBe('That link redirects too often')
    expect(loop.calls).toHaveLength(4)
  })

  it('refuses a file over 128 MiB by its Content-Length', async () => {
    const { impl } = fakeFetch(() => new Response(zip, { headers: { 'content-length': String(128 * MiB + 1) } }))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl))).toBe('That file is too big')
  })

  it('refuses a file over 128 MiB while streaming one without a Content-Length', async () => {
    const chunk = new Uint8Array(MiB)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) { if (sent++ > 200) c.close(); else c.enqueue(chunk) },
    })
    const { impl } = fakeFetch(() => new Response(body))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl))).toBe('That file is too big')
    expect(sent).toBeLessThan(135)
  })

  it('probes a folder link for the known names, .mp3 then .wav, a few at a time', async () => {
    let open = 0
    let most = 0
    const { impl, calls } = fakeFetch(async url => {
      open++; most = Math.max(most, open)
      await new Promise(r => setTimeout(r, 1))
      open--
      const file = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
      if (['0.mp3', '180.mp3', 'gameshot.mp3', 'game on.wav', 'busted.wav'].includes(file)) {
        return new Response(`audio:${file}`, { headers: { 'content-type': 'audio/mpeg' } })
      }
      return notFound()
    })
    const pack = await fetchPack('https://autodarts.x10.mx/1_male_eng/', impl)

    expect(most).toBeLessThanOrEqual(6)
    expect(most).toBeGreaterThan(1)
    expect(calls).toContain('https://autodarts.x10.mx/1_male_eng/0.mp3')
    expect(calls).toContain('https://autodarts.x10.mx/1_male_eng/179.wav')
    expect(calls).toContain('https://autodarts.x10.mx/1_male_eng/game%20on.wav')
    expect(calls).toContain('https://autodarts.x10.mx/1_male_eng/matchshot.wav')
    expect(calls).not.toContain('https://autodarts.x10.mx/1_male_eng/0.wav')  // the .mp3 was there
    expect(calls).toHaveLength(2 * 186 - 3)

    expect(pack.name).toBe('1_male_eng')
    expect(pack.lang).toBeNull()
    expect(pack.total).toBe(5)
    expect(Object.keys(pack.clips).sort()).toEqual(['0', '180', 'busted', 'gameon', 'gameshot'])
    expect(pack.clips.gameon[0].mime).toBe('audio/wav')
    expect(pack.clips['180'][0].mime).toBe('audio/mpeg')
    expect(new TextDecoder().decode(pack.clips.busted[0].bytes)).toBe('audio:busted.wav')
  })

  it('probes a folder link without a trailing slash inside that folder', async () => {
    const { impl, calls } = fakeFetch(url => url.endsWith('/180.mp3') ? new Response('x') : notFound())
    const pack = await fetchPack('https://autodarts.x10.mx/1_male_eng', impl)
    expect(calls[0]).toBe('https://autodarts.x10.mx/1_male_eng/0.mp3')
    expect(pack.name).toBe('1_male_eng')
    expect(Object.keys(pack.clips)).toEqual(['180'])
  })

  it('skips pages a folder serves in place of a clip', async () => {
    const { impl } = fakeFetch(url => url.endsWith('/180.mp3')
      ? new Response('x')
      : new Response('<html>not here</html>', { headers: { 'content-type': 'text/html' } }))
    const pack = await fetchPack('https://autodarts.x10.mx/1_male_eng/', impl)
    expect(pack.total).toBe(1)
  })

  it('stops probing a folder once one request fails, and aborts the ones under way', async () => {
    const signals: AbortSignal[] = []
    const { impl, calls } = fakeFetch((url, init) => {
      if (url.endsWith('/5.mp3')) return Promise.reject(new TypeError('getaddrinfo ENOTFOUND 10.0.0.1'))
      const signal = init?.signal
      if (!signal) throw new Error('no signal')
      signals.push(signal)
      // The others hang until they're aborted
      return new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    expect(await linkError(fetchPack('https://autodarts.x10.mx/1_male_eng/', impl))).toBe("Couldn't reach that site")
    expect(signals).toHaveLength(5)
    expect(signals.every(s => s.aborted)).toBe(true)
    await new Promise(r => setTimeout(r, 20))
    expect(calls).toHaveLength(6)
  })

  it('gives a folder five minutes in all, or what the options say', async () => {
    const { impl } = fakeFetch(() => new Promise<Response>(resolve => setTimeout(() => resolve(notFound()), 5)))
    expect(await linkError(fetchPack('https://autodarts.x10.mx/1_male_eng/', impl, { folderDeadlineMs: 30 })))
      .toBe('That site took too long')
  })

  it('asks for X.mp3 before X.wav', async () => {
    const { impl, calls } = fakeFetch(notFound)
    await fetchPack('https://autodarts.x10.mx/1_male_eng/', impl).catch(() => {})
    for (const name of ['0', '42', '180', 'game%20on', 'matchshot']) {
      const mp3 = calls.indexOf(`https://autodarts.x10.mx/1_male_eng/${name}.mp3`)
      expect(mp3).toBeGreaterThanOrEqual(0)
      expect(calls.indexOf(`https://autodarts.x10.mx/1_male_eng/${name}.wav`)).toBeGreaterThan(mp3)
    }
  })

  it('says so when a folder has none of the clips', async () => {
    const { impl } = fakeFetch(notFound)
    expect(await linkError(fetchPack('https://autodarts.x10.mx/nothing/', impl))).toBe('No caller clips found at that link')
  })

  it('gives up on a site that doesn\'t answer', async () => {
    const { impl } = fakeFetch(() => new Promise<Response>(() => {}))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl, { zipTimeoutMs: 20 }))).toBe("That site didn't answer")
  })

  it('waits five minutes for a zip and a minute for each folder probe', async () => {
    vi.useFakeTimers()
    try {
      const zipLink = 'https://darts-downloads.peschi.org/x.zip'
      const slow = fakeFetch(() => new Promise<Response>(resolve => setTimeout(() => resolve(new Response(zip)), 4 * 60_000)))
      const pack = fetchPack(zipLink, slow.impl)
      await vi.advanceTimersByTimeAsync(4 * 60_000)
      expect((await pack).clips['180']).toHaveLength(1)

      const never = fakeFetch(() => new Promise<Response>(() => {}))
      let zipDone = false
      const zipFails = linkError(fetchPack(zipLink, never.impl)).finally(() => { zipDone = true })
      await vi.advanceTimersByTimeAsync(5 * 60_000 - 1)
      expect(zipDone).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await zipFails).toBe("That site didn't answer")

      const probeFails = linkError(fetchPack('https://autodarts.x10.mx/1_male_eng/', never.impl))
      await vi.advanceTimersByTimeAsync(60_000)
      expect(await probeFails).toBe("That site didn't answer")
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up on a body that stops coming', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(10)) } })
    const { impl } = fakeFetch(() => new Response(body))
    expect(await linkError(fetchPack('https://darts-downloads.peschi.org/x.zip', impl, { zipTimeoutMs: 20 }))).toBe("That site didn't answer")
  })
})
