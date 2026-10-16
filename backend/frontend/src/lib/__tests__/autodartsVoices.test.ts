import { describe, it, expect, vi, afterEach } from 'vitest'
import getAutodartsVoices from '../caller/autodartsVoices.js'
import { bookmarkletHref, consoleSnippet } from '../caller/bookmarklet.js'

const ORIGIN = 'https://play.autodarts.com'
// The site's files; each test gets its own
const site = (): Record<string, string | Uint8Array> => ({
  [`${ORIGIN}/assets/index-x1.js`]:
    'a="assets/dotty-floor-english-Ab12.mp3";b=()=>import("./dotty-floor-english-Cd34.js");c="hware-floor-english-Ef56.js"',
  [`${ORIGIN}/assets/dotty-floor-english-Ab12.mp3`]: new Uint8Array([1, 2, 3, 4]),
})

function page(files = site()) {
  const downloads: { name: string; blob: Blob }[] = []
  const blobs = new Map<string, Blob>()
  vi.stubGlobal('location', { origin: ORIGIN })
  vi.stubGlobal(
    'fetch',
    // TS 5.9's generic Uint8Array makes `string | Uint8Array` fail against BodyInit; both arms are valid bodies
    (url: string) => new Response((files[url] ?? '') as BodyInit, { status: files[url] ? 200 : 404 }),
  )
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('document', {
    // The entry script; performance stays Node's own (vitest relies on it), which lists no resources
    querySelectorAll: (sel: string) => (sel === 'script[src]' ? [{ src: `${ORIGIN}/assets/index-x1.js` }] : []),
    body: { append: () => {} },
    createElement: () => {
      const a = { href: '', download: '', click: () => downloads.push({ name: a.download, blob: blobs.get(a.href)! }), remove: () => {} }
      return a
    },
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
    const u = `blob:${blobs.size}`
    blobs.set(u, b as Blob)
    return u
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return downloads
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getAutodartsVoices', () => {
  it('zips each voice: its MP3 and a JSON table from the chunk', async () => {
    const downloads = page()
    const load = vi.fn((url: string) => {
      expect(url).toBe(`${ORIGIN}/assets/dotty-floor-english-Cd34.js`)
      return Promise.resolve({ default: { '1': [0, 654], '2': [654, 498] }, game_on: [1152, 904], other: 'x' })
    })
    const report = await getAutodartsVoices(load)
    expect(report).toEqual(['dotty-floor-english: 3 clips', 'hware-floor-english: no mp3 found'])
    expect(downloads.map(d => d.name)).toEqual(['dotty-floor-english-Ab12.zip'])
    const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('PK\x03\x04')).toBe(true)
    expect(text).toContain('dotty-floor-english-Ab12.mp3')
    expect(text).toContain('"mp3Bytes":4')
    expect(text).toContain('"game_on":[1152,904]')
  })

  it('says so when it finds no voices', async () => {
    page({ ...site(), [`${ORIGIN}/assets/index-x1.js`]: 'nothing here' })
    expect(await getAutodartsVoices(vi.fn())).toEqual([])
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('no Autodarts voices found'))
  })
})

describe('bookmarklet', () => {
  it('is the same code as a javascript: URL that parses', () => {
    expect(bookmarkletHref.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(bookmarkletHref.slice('javascript:'.length))).toBe(consoleSnippet)
    // Confirms the snippet parses as valid JS; it's never executed here
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    expect(() => new Function(consoleSnippet)).not.toThrow()
    expect(consoleSnippet).not.toContain('export default')
  })
})
