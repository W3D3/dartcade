// The "Get Autodarts voices" bookmarklet (the Caller voices card in Settings). It runs on
// play.autodarts.com, in the player's own logged-in tab: finds each caller voice's MP3 and the chunk
// with its timings, reads the timings from the chunk's exports, and downloads one zip per voice (the
// MP3 and a JSON table) to import in dartcade. Self-contained: the SPA turns this file's text into the
// bookmarklet, so it can't import anything. Design:
// docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md
export default async function getAutodartsVoices(load = url => import(url)) {
  const NAME = /((?:dotty|hware)-floor-[a-z]+)-([\w-]{4,}?)\.(mp3|js)\b/g
  // Where the names are: the page's scripts and every JS file it has loaded
  const sources = new Set([
    ...[...document.querySelectorAll('script[src]')].map(s => s.src),
    ...[...document.querySelectorAll('link[rel=modulepreload]')].map(l => l.href),
    ...performance
      .getEntriesByType('resource')
      .map(e => e.name)
      .filter(u => /\.js(\?|$)/.test(u)),
  ])
  const found = {}
  for (const src of sources) {
    if (!src.startsWith(location.origin)) continue
    let text = ''
    try {
      text = await (await fetch(src)).text()
    } catch {
      continue
    }
    for (const m of text.matchAll(NAME)) (found[m[1]] ??= {})[m[3]] = new URL(`${m[1]}-${m[2]}.${m[3]}`, src).href
  }
  if (Object.keys(found).length === 0) {
    alert('dartcade: no Autodarts voices found. Play a caller voice once in Autodarts, then try again.')
    return []
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = bytes => {
    let c = 0xffffffff
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  // A zip of stored (not deflated) files: an MP3 doesn't shrink
  const zip = entries => {
    const enc = new TextEncoder()
    const local = []
    const central = []
    let offset = 0
    for (const { name, bytes } of entries) {
      const n = enc.encode(name)
      const crc = crc32(bytes)
      const lh = new DataView(new ArrayBuffer(30))
      lh.setUint32(0, 0x04034b50, true)
      lh.setUint16(4, 20, true)
      lh.setUint32(14, crc, true)
      lh.setUint32(18, bytes.length, true)
      lh.setUint32(22, bytes.length, true)
      lh.setUint16(26, n.length, true)
      local.push(lh, n, bytes)
      const ch = new DataView(new ArrayBuffer(46))
      ch.setUint32(0, 0x02014b50, true)
      ch.setUint16(4, 20, true)
      ch.setUint16(6, 20, true)
      ch.setUint32(16, crc, true)
      ch.setUint32(20, bytes.length, true)
      ch.setUint32(24, bytes.length, true)
      ch.setUint16(28, n.length, true)
      ch.setUint32(42, offset, true)
      central.push(ch, n)
      offset += 30 + n.length + bytes.length
    }
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, entries.length, true)
    end.setUint16(10, entries.length, true)
    end.setUint32(
      12,
      central.reduce((s, p) => s + p.byteLength, 0),
      true,
    )
    end.setUint32(16, offset, true)
    return new Blob([...local, ...central, end], { type: 'application/zip' })
  }
  const save = (blob, name) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }
  const isClip = v => Array.isArray(v) && v.length >= 2 && v.every(n => typeof n === 'number')

  const report = []
  for (const [voice, { mp3, js }] of Object.entries(found)) {
    if (!mp3 || !js) {
      report.push(`${voice}: no ${mp3 ? 'timings' : 'mp3'} found`)
      continue
    }
    try {
      // The chunk's default export maps scores to [offset, duration]; the other calls are exports of their own
      const mod = await load(js)
      const sprite = {}
      for (const [k, v] of Object.entries(mod.default ?? {})) if (isClip(v)) sprite[k] = v.slice(0, 2)
      for (const [k, v] of Object.entries(mod)) if (k !== 'default' && isClip(v)) sprite[k] = v.slice(0, 2)
      const audio = new Uint8Array(await (await fetch(mp3)).arrayBuffer())
      const mp3Name = mp3.split('/').pop()
      const stem = mp3Name.replace(/\.mp3$/, '')
      const table = JSON.stringify({ voice, mp3: mp3Name, mp3Bytes: audio.length, unit: 'ms', sprite })
      save(
        zip([
          { name: mp3Name, bytes: audio },
          { name: `${stem}.json`, bytes: new TextEncoder().encode(table) },
        ]),
        `${stem}.zip`,
      )
      report.push(`${voice}: ${Object.keys(sprite).length} clips`)
    } catch (err) {
      console.error('[dartcade]', voice, err)
      report.push(`${voice}: failed (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  alert(`dartcade:\n${report.join('\n')}`)
  return report
}
