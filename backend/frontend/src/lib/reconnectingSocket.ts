// A WebSocket that reconnects after a drop, waiting 500 ms and doubling up to 30 s (back to
// 500 ms once a connection delivers a message). The game, lobby and /ws/me sockets all sit on it.

export type OpenSocket = (url: string) => WebSocket
const openWs: OpenSocket = url => new WebSocket(url)

const FIRST_DELAY = 500
const MAX_DELAY = 30_000

export interface SocketHandlers {
  onOpen?: () => void
  /** Each text message, parsed as JSON; anything else (binary, broken JSON) never gets here. */
  onMessage: (data: unknown) => void
  /** The socket closed. Return 'stop' to give up for good; otherwise it reconnects. */
  onClose?: (code: number) => 'stop' | undefined
}

export interface ReconnectingSocket {
  /** Sends on the current socket, if any. */
  send(data: string): void
  /** Closes the socket and never reconnects; a closed socket's events are ignored from here on. */
  stop(): void
  /** True after stop(), or once onClose said 'stop'. */
  readonly stopped: boolean
}

export function reconnectingSocket(url: string, handlers: SocketHandlers, open: OpenSocket = openWs): ReconnectingSocket {
  let ws: WebSocket | null = null
  let stopped = false
  let delay = FIRST_DELAY
  let retry: ReturnType<typeof setTimeout> | null = null

  function connect() {
    retry = null
    if (stopped) return
    const socket = open(url)
    ws = socket
    // Only the current socket counts: a replaced or stopped one may still fire late
    const current = () => ws === socket && !stopped
    socket.onopen = () => {
      if (current()) handlers.onOpen?.()
    }
    socket.onmessage = e => {
      if (!current() || typeof e.data !== 'string') return
      let data: unknown
      try {
        data = JSON.parse(e.data)
      } catch {
        return
      }
      // The connection works (opening alone doesn't prove it: a server may accept and close)
      delay = FIRST_DELAY
      handlers.onMessage(data)
    }
    socket.onclose = e => {
      if (!current()) return
      ws = null
      if (handlers.onClose?.(e.code) === 'stop') stopped = true
      if (stopped) return
      retry = setTimeout(connect, delay)
      delay = Math.min(delay * 2, MAX_DELAY)
    }
    socket.onerror = () => socket.close()
  }

  connect()

  return {
    send(data) {
      ws?.send(data)
    },
    stop() {
      stopped = true
      if (retry !== null) {
        clearTimeout(retry)
        retry = null
      }
      ws?.close()
      ws = null
    },
    get stopped() {
      return stopped
    },
  }
}
