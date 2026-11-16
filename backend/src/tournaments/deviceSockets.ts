import type { WebSocket } from 'ws'
import { WsCloseCode } from '../schema/game-ws.js'

/** The open sockets of each venue device session, so revoking a device cuts them at once. */
const open = new Map<string, Set<WebSocket>>()

export function trackDevice(deviceId: string, socket: WebSocket): void {
  const set = open.get(deviceId) ?? new Set()
  set.add(socket)
  open.set(deviceId, set)
  socket.once('close', () => {
    set.delete(socket)
    if (set.size === 0) open.delete(deviceId)
  })
}

export function cutDevices(deviceIds: string[]): void {
  for (const id of deviceIds) {
    for (const socket of open.get(id) ?? []) socket.close(WsCloseCode.Unauthorized, 'device revoked')
  }
}
