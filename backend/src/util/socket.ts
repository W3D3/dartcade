import type { RawData, WebSocket } from 'ws'

/**
 * Whether the socket is still open. A function rather than an inline check, so a check after
 * an await isn't narrowed away: readyState can change across the await, though TS doesn't see it.
 */
export function isOpen(socket: WebSocket): boolean {
  return socket.readyState === socket.OPEN
}

/** Runs `fn` once when the socket goes: 'error' is followed by 'close', whichever comes first. */
export function onceGone(socket: WebSocket, fn: () => void): void {
  let gone = false
  const onGone = () => {
    if (gone) return
    gone = true
    fn()
  }
  socket.on('close', onGone)
  socket.on('error', onGone)
}

// ws hands over a Buffer (its default binaryType); the other forms are handled for completeness
export function rawText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString()
  return Buffer.isBuffer(raw) ? raw.toString() : Buffer.from(raw).toString()
}
