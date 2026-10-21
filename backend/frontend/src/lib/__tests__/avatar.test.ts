import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { ComponentProps } from 'svelte'
import Avatar from '../components/Avatar.svelte'
import { avatarColor } from '../avatarColor.js'
import { botAvatarColor } from '../botAvatarColor.js'

const html = (props: ComponentProps<typeof Avatar>) => render(Avatar, { props }).body

describe('Avatar', () => {
  it("shows a person's initial, in their name-hash colour", () => {
    const out = html({ name: 'Christoph' })
    expect(out).toContain('>C<')
    expect(out).toContain(avatarColor('Christoph'))
    expect(out).not.toContain('lucide-bot')
  })

  it("shows a bot's robot glyph instead of an initial, in its level's colour", () => {
    const out = html({ name: 'Bot Lvl 5', bot: { level: 5 } })
    expect(out).toContain('lucide-bot')
    expect(out).toContain(botAvatarColor(5))
    expect(out).not.toContain('>B<')
  })

  it('still shows the robot glyph under accent and quiet tones, which override the level colour same as a name colour', () => {
    const accent = html({ name: 'Bot Lvl 8', bot: { level: 8 }, tone: 'accent' })
    expect(accent).toContain('lucide-bot')
    expect(accent).toContain('bg-accent')
    const quiet = html({ name: 'Bot Lvl 8', bot: { level: 8 }, tone: 'quiet' })
    expect(quiet).toContain('lucide-bot')
    expect(quiet).toContain('bg-line-3')
  })

  it('keeps its level colour even when guest=true — a bot has no account either, so a caller that derives guest from userId===null naturally passes it for a bot seat too', () => {
    const out = html({ name: 'Bot Lvl 3', bot: { level: 3 }, guest: true })
    expect(out).toContain('lucide-bot')
    expect(out).toContain(botAvatarColor(3))
    expect(out).not.toContain('border-dashed')
  })

  it('a human guest still gets the dashed guest chip (no bot set)', () => {
    const out = html({ name: 'Lena', guest: true })
    expect(out).toContain('border-dashed')
    expect(out).not.toContain('lucide-bot')
  })

  it("shows the Dartcade mark on its chosen background and foreground colours instead of the initial, when avatar.kind is 'preset'", () => {
    const out = html({ name: 'Lena', avatar: { kind: 'preset', preset: 'logo', color: '#808080', fgColor: '#000000' } })
    expect(out).toContain('lucide-dartcade-mark')
    expect(out).not.toContain('>L<')
    expect(out).toContain('background-color: #808080')
    expect(out).toContain('color: #000000')
    expect(out).not.toContain(avatarColor('Lena'))
  })

  it('background and foreground colours are independent — either can change without the other', () => {
    const out = html({ name: 'Lena', avatar: { kind: 'preset', preset: 'logo', color: '#2d6cdf', fgColor: '#ffffff' } })
    expect(out).toContain('background-color: #2d6cdf')
    expect(out).toContain('color: #ffffff')
  })

  it("shows the preset's real colours even under tone='accent' or 'quiet' — a chosen avatar is never hidden behind a forced chip colour", () => {
    const accent = html({ name: 'Lena', avatar: { kind: 'preset', preset: 'logo', color: '#3a8f4a', fgColor: '#ffffff' }, tone: 'accent' })
    expect(accent).toContain('background-color: #3a8f4a')
    expect(accent).not.toContain('bg-accent')
    const quiet = html({ name: 'Lena', avatar: { kind: 'preset', preset: 'logo', color: '#3a8f4a', fgColor: '#ffffff' }, tone: 'quiet' })
    expect(quiet).toContain('background-color: #3a8f4a')
    expect(quiet).not.toContain('bg-line-3')
  })

  it("shows the uploaded photo instead of the initial, when avatar.kind is 'upload'", () => {
    const out = html({ name: 'Lena', userId: 'lena', avatar: { kind: 'upload', version: 3 } })
    expect(out).toContain('src="/api/users/lena/avatar?v=3"')
    expect(out).not.toContain('>L<')
  })

  it("falls back to the initial when avatar.kind is 'upload' but no userId was given", () => {
    const out = html({ name: 'Lena', avatar: { kind: 'upload', version: 3 } })
    expect(out).not.toContain('<img')
    expect(out).toContain('>L<')
  })

  it("avatar.kind: 'none' (or no avatar prop at all) shows the initial, same as today", () => {
    expect(html({ name: 'Lena', avatar: { kind: 'none' } })).toContain('>L<')
    expect(html({ name: 'Lena' })).toContain('>L<')
  })

  it('a bot glyph still wins over a preset or uploaded avatar — the more specific identity', () => {
    const preset = html({
      name: 'Bot Lvl 4',
      bot: { level: 4 },
      avatar: { kind: 'preset', preset: 'logo', color: '#808080', fgColor: '#000000' },
    })
    expect(preset).toContain('lucide-bot')
    expect(preset).not.toContain('lucide-dartcade-mark')
    const upload = html({ name: 'Bot Lvl 4', bot: { level: 4 }, userId: 'x', avatar: { kind: 'upload', version: 1 } })
    expect(upload).toContain('lucide-bot')
    expect(upload).not.toContain('<img')
  })
})
