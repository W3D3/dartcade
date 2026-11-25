// WLED devices found on a board's network and their reachability, in memory only (nothing
// in the DB or the event log). The bridge rescans periodically and after a manual probe.

export type FoundDevice = { mac: string; host: string; name: string; leds: number; version: string; segments: number }
export type DeviceStatus = { reachable: boolean; error?: string; since: Date }
/** The effect and palette names a device reported, by WLED id. */
export type DeviceEffects = { version: string; effects: string[]; palettes: string[] }

type Found = {
  scan: FoundDevice[]
  probes: FoundDevice[]
  scannedAt: Date | null
  probe: { host: string; error?: string } | null
  scanError?: string
}

export class LightsStore {
  private found_ = new Map<string, Found>()
  private statuses = new Map<string, DeviceStatus>()
  private effects_ = new Map<string, DeviceEffects>()

  /** Replaces the scan list; a scan error is cleared by the next successful scan (no error passed). */
  setFound(boardId: string, devices: FoundDevice[], scannedAt: Date, scanError?: string): void {
    this.found_.set(boardId, { scan: devices, probes: [], scannedAt, probe: null, scanError })
  }

  /** A single-device probe (manual, by host): adds to the list shown until the next scan. */
  addProbe(boardId: string, host: string, device: FoundDevice | null, error?: string): void {
    const f = this.found_.get(boardId) ?? { scan: [], probes: [], scannedAt: null, probe: null }
    if (device) f.probes = [...f.probes.filter(d => d.mac !== device.mac), device]
    f.probe = { host, error }
    this.found_.set(boardId, f)
  }

  found(boardId: string): {
    devices: FoundDevice[]
    scannedAt: Date | null
    probe: { host: string; error?: string } | null
    scanError?: string
  } {
    const f = this.found_.get(boardId)
    if (!f) return { devices: [], scannedAt: null, probe: null }
    const scanMacs = new Set(f.scan.map(d => d.mac))
    const devices = [...f.scan, ...f.probes.filter(d => !scanMacs.has(d.mac))]
    return { devices, scannedAt: f.scannedAt, probe: f.probe, scanError: f.scanError }
  }

  setStatus(boardId: string, deviceId: string, s: { reachable: boolean; error?: string }): void {
    const key = `${boardId}/${deviceId}`
    const prev = this.statuses.get(key)
    const unchanged = prev && prev.reachable === s.reachable && prev.error === s.error
    this.statuses.set(key, { ...s, since: unchanged ? prev.since : new Date() })
  }

  status(boardId: string, deviceId: string): DeviceStatus | null {
    return this.statuses.get(`${boardId}/${deviceId}`) ?? null
  }

  setEffects(boardId: string, deviceId: string, e: DeviceEffects): void {
    this.effects_.set(`${boardId}/${deviceId}`, e)
  }

  effects(boardId: string, deviceId: string): DeviceEffects | null {
    return this.effects_.get(`${boardId}/${deviceId}`) ?? null
  }

  /** Forgets the board's devices, statuses and effect lists (bridge gone, board deleted): a board back online sends fresh ones. */
  clear(boardId: string): void {
    this.found_.delete(boardId)
    for (const map of [this.statuses, this.effects_]) for (const key of map.keys()) if (key.startsWith(`${boardId}/`)) map.delete(key)
  }
}

export const lightsStore = new LightsStore()
