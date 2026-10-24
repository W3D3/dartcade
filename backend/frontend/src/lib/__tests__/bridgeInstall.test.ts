import { describe, expect, it } from 'vitest'
import { bridgeUrl, detectOs, installCommand } from '../bridgeInstall'

describe('bridge install commands', () => {
  it('points the bridge at this server over wss for https and ws for http', () => {
    expect(bridgeUrl('https://play.example.com')).toBe('wss://play.example.com')
    expect(bridgeUrl('http://localhost:3000')).toBe('ws://localhost:3000')
  })

  it('puts the install token and server into every OS command', () => {
    for (const os of ['linux', 'macos', 'windows'] as const) {
      const cmd = installCommand(os, 'TOK123', 'https://play.example.com')
      expect(cmd).toContain('TOK123')
      expect(cmd).toContain('wss://play.example.com')
    }
  })

  it('installs a service on every OS, and keeps the token out of an argument on unix', () => {
    for (const os of ['linux', 'macos'] as const) {
      const cmd = installCommand(os, 'K', 'https://x')
      expect(cmd).toContain('--service')
      expect(cmd).toContain('DARTCADE_INSTALL_TOKEN=K sh')
      expect(cmd).not.toContain('--token')
    }
    const win = installCommand('windows', 'K', 'https://x')
    expect(win).toContain('install-bridge.ps1')
    expect(win).toContain('-InstallToken K')
  })

  it('picks the OS from the user agent', () => {
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('linux')
  })
})
