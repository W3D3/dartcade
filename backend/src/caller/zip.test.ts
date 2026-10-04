import { describe, it, expect } from 'vitest'
import { listEntries, readEntry, ZipError } from './zip.js'
import { makeZip } from './zipFixture.js'

const text = (b: Uint8Array) => new TextDecoder().decode(b)

describe('zip reader', () => {
  it('lists entries and reads deflated and stored ones', async () => {
    const zip = makeZip([{ name: 'a.txt', data: 'hello hello hello' }, { name: 'dir/b.txt', data: 'stored', method: 0 }])
    const entries = listEntries(zip)
    expect(entries.map(e => e.name)).toEqual(['a.txt', 'dir/b.txt'])
    expect(text(await readEntry(zip, entries[0]))).toBe('hello hello hello')
    expect(text(await readEntry(zip, entries[1]))).toBe('stored')
  })

  it('reads a zip inside a zip', async () => {
    const inner = makeZip([{ name: 'x.mp3', data: 'clip' }])
    const outer = makeZip([{ name: 'pack.zip', data: inner }])
    const innerBytes = await readEntry(outer, listEntries(outer)[0])
    expect(text(await readEntry(innerBytes, listEntries(innerBytes)[0]))).toBe('clip')
  })

  it('refuses what it can\'t read', async () => {
    expect(() => listEntries(new TextEncoder().encode('not a zip at all, sorry'))).toThrow(new ZipError('Not a zip file'))
    const zip64 = makeZip([{ name: 'a', data: 'a' }])
    new DataView(zip64.buffer).setUint16(zip64.length - 22 + 10, 0xffff, true)
    expect(() => listEntries(zip64)).toThrow(new ZipError("Zip64 isn't supported"))
    const locked = makeZip([{ name: 'a', data: 'a', encrypted: true }])
    await expect(readEntry(locked, listEntries(locked)[0])).rejects.toThrow("Encrypted zips aren't supported")
  })

  it('handles corrupt zips gracefully', async () => {
    // zip cut off in the middle of central directory
    const partial = makeZip([{ name: 'file.txt', data: 'hello' }])
    const truncated = partial.slice(0, partial.length - 10)
    expect(() => listEntries(truncated)).toThrow(new ZipError('Not a zip file'))

    // entry pointing past the end of the zip
    const zip = makeZip([{ name: 'file.txt', data: 'hello' }])
    const entries = listEntries(zip)
    entries[0].compressedSize = 1000 // point past end
    await expect(readEntry(zip, entries[0])).rejects.toThrow(new ZipError('Not a zip file'))
  })

  it('handles end record with comment', () => {
    const zip = makeZip([{ name: 'file.txt', data: 'content' }], 'optional comment here')
    const entries = listEntries(zip)
    expect(entries[0].name).toBe('file.txt')
    expect(entries).toHaveLength(1)
  })

  it('handles local header with extra field', async () => {
    const zip = makeZip([{ name: 'file.txt', data: 'test', localExtra: 4 }])
    const entries = listEntries(zip)
    expect(entries[0].name).toBe('file.txt')
    expect(text(await readEntry(zip, entries[0]))).toBe('test')
  })

  it('reads zip at nonzero offset in larger buffer', async () => {
    const zip = makeZip([{ name: 'file.txt', data: 'content' }])
    const large = new Uint8Array(zip.length + 10)
    large.set(zip, 10)
    const view = new Uint8Array(large.buffer, large.byteOffset + 10, zip.length)
    const entries = listEntries(view)
    expect(text(await readEntry(view, entries[0]))).toBe('content')
  })
})
