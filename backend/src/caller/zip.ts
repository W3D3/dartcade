// A small zip reader for voice packs: stored and deflated entries, no zip64, no encryption.
// Inflates with the browser's DecompressionStream, so it needs no library.

export class ZipError extends Error {}

export interface ZipEntry { name: string; method: number; flags: number; compressedSize: number; size: number; offset: number }

const END = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

const view = (buf: Uint8Array) => new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

/** The entries in the zip's central directory, in order. */
export function listEntries(buf: Uint8Array): ZipEntry[] {
  const v = view(buf)
  let end = -1
  // The end record sits in the last 22 bytes plus an optional comment of up to 64 KiB
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === END) { end = i; break }
  }
  if (end < 0) throw new ZipError('Not a zip file')
  if (end + 20 > buf.length) throw new ZipError('Not a zip file')
  const count = v.getUint16(end + 10, true)
  const dirOffset = v.getUint32(end + 16, true)
  if (count === 0xffff || dirOffset === 0xffffffff) throw new ZipError("Zip64 isn't supported")
  if (dirOffset > buf.length) throw new ZipError('Not a zip file')
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let p = dirOffset
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length) throw new ZipError('Not a zip file')
    if (v.getUint32(p, true) !== CENTRAL) throw new ZipError('Not a zip file')
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    if (p + 46 + nameLen + extraLen + commentLen > buf.length) throw new ZipError('Not a zip file')
    const entry: ZipEntry = {
      flags: v.getUint16(p + 8, true),
      method: v.getUint16(p + 10, true),
      compressedSize: v.getUint32(p + 20, true),
      size: v.getUint32(p + 24, true),
      offset: v.getUint32(p + 42, true),
      name: decoder.decode(buf.subarray(p + 46, p + 46 + nameLen)),
    }
    if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff || entry.offset === 0xffffffff) {
      throw new ZipError("Zip64 isn't supported")
    }
    entries.push(entry)
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** One entry's bytes, inflated. */
export async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  if (e.flags & 1) throw new ZipError("Encrypted zips aren't supported")
  const v = view(buf)
  if (e.offset + 30 > buf.length) throw new ZipError('Not a zip file')
  if (v.getUint32(e.offset, true) !== LOCAL) throw new ZipError('Not a zip file')
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
  if (start + e.compressedSize > buf.length) throw new ZipError('Not a zip file')
  const data = buf.slice(start, start + e.compressedSize)
  if (e.method === 0) return data
  if (e.method !== 8) throw new ZipError(`Compression method ${e.method} isn't supported`)
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
