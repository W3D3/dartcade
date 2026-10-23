import { describe, expect, it } from 'vitest'
import { bridgeUrl, detectOs, installCommand } from '../bridgeInstall'

describe('bridge install commands', () => {
  it('points the bridge at this server over wss for https and ws for http', () => {
    expect(bridgeUrl('https://play.example.com')).toBe('wss://play.example.com/bridge')
    expect(bridgeUrl('http://localhost:3000')).toBe('ws://localhost:3000/bridge')
  })

  it('puts the key and server into every OS command', () => {
    for (const os of ['linux', 'macos', 'windows'] as const) {
      const cmd = installCommand(os, 'KEY123', 'https://play.example.com')
      expect(cmd).toContain('KEY123')
      expect(cmd).toContain('wss://play.example.com/bridge')
    }
  })

  it('installs a service on Linux, and says which board to use elsewhere', () => {
    expect(installCommand('linux', 'K', 'https://x')).toContain('--service')
    expect(installCommand('linux', 'K', 'https://x')).toContain('DARTCADE_TOKEN=K sh')
    expect(installCommand('linux', 'K', 'https://x')).not.toContain('--token')
    expect(installCommand('macos', 'K', 'https://x')).toContain('DARTCADE_BOARD_URL=')
    expect(installCommand('windows', 'K', 'https://x')).toContain('$env:DARTCADE_BOARD_URL=')
  })

  it('picks the OS from the user agent', () => {
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('linux')
  })
})
