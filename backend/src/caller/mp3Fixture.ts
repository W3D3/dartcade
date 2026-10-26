// Tiny CBR MP3s built by hand for the Autodarts cutter's tests: 48 kHz, 128 kbps, stereo MPEG-1
// Layer III frames (384 bytes, 24 ms each). Not playable audio: frame k's body is the byte k & 0xff,
// so a test can tell which frames a slice holds.

const FRAME = 384

function frame(fill: number, mpeg2 = false): Uint8Array {
  const f = new Uint8Array(FRAME).fill(fill)
  // Sync, MPEG-1 (or MPEG-2) Layer III without CRC; 128 kbps, 48 kHz, no padding; stereo
  f.set([0xff, mpeg2 ? 0xf3 : 0xfb, 0x94, 0x00], 0)
  return f
}

/** `delay`: an encoder delay (samples) written into the Info frame's LAME tag, as Autodarts' MP3s have (576). */
export function makeMp3(
  o: { frames?: number; id3?: boolean; info?: boolean; delay?: number; tag?: boolean; mpeg2?: boolean } = {},
): Uint8Array {
  const parts: Uint8Array[] = []
  if (o.id3) {
    // An ID3v2 header announcing 20 bytes of tag (syncsafe size), then the 20 bytes
    parts.push(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20]), new Uint8Array(20))
  }
  if (o.info) {
    const info = frame(0xee)
    info.set([0x49, 0x6e, 0x66, 0x6f], 4 + 32) // "Info" after the stereo side info
    if (o.delay !== undefined) {
      info.set([0, 0, 0, 0xf], 36 + 4) // flags: frames, bytes, TOC and quality, so the LAME tag is 120 bytes on
      info.set([0x4c, 0x61, 0x76, 0x63], 36 + 120) // "Lavc", the encoder's name, as Autodarts' say
      info.set([o.delay >> 4, (o.delay & 15) << 4, 0], 36 + 141) // delay, then 12 bits of padding
    }
    parts.push(info)
  }
  for (let k = 0; k < (o.frames ?? 100); k++) parts.push(frame(k & 0xff, o.mpeg2))
  if (o.tag) parts.push(new Uint8Array(128).fill(0x20).fill(0x54, 0, 1).fill(0x41, 1, 2).fill(0x47, 2, 3)) // ID3v1 "TAG"
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
