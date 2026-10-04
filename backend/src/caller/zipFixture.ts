import { deflateRawSync } from 'node:zlib'

type F = { name: string; data: Uint8Array | string; method?: 0 | 8; encrypted?: boolean; localExtra?: number }

/** A zip built by hand: local headers, central directory, end record (CRCs left 0; the reader doesn't check them). */
export function makeZip(files: F[], comment?: string): Uint8Array {
  const enc = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const method = f.method ?? 8
    const body = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw
    const name = enc.encode(f.name)
    const flags = f.encrypted ? 1 : 0
    const localExtra = f.localExtra ?? 0
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(6, flags, true); lh.setUint16(8, method, true)
    lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true)
    lh.setUint16(28, localExtra, true)
    local.push(new Uint8Array(lh.buffer), name, new Uint8Array(localExtra), body)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(8, flags, true); ch.setUint16(10, method, true)
    ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), name)
    offset += 30 + name.length + body.length + localExtra
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const commentBytes = comment ? enc.encode(comment) : new Uint8Array(0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, commentBytes.length, true)
  const parts = [...local, ...central, new Uint8Array(end.buffer), commentBytes]
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const part of parts) { out.set(part, p); p += part.length }
  return out
}
