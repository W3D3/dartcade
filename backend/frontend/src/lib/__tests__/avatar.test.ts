import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { ComponentProps } from 'svelte'
import Avatar from '../components/Avatar.svelte'
import { avatarColor } from '../avatarColor.js'
import { botAvatarColor } from '../botAvatarColor.js'

const bot = (level: number) => ({ avatar: { kind: 'none' as const }, userId: null, bot: { level } })
const html = (props: ComponentProps<typeof Avatar>) => render(Avatar, { props }).body

describe('Avatar', () => {
  it("shows a person's initial, in their name-hash colour", () => {
    const out = html({ name: 'Christoph', face: null })
    expect(out).toContain('>C<')
    expect(out).toContain(avatarColor('Christoph'))
    expect(out).not.toContain('lucide-bot')
  })

  it("shows a bot's robot glyph instead of an initial, in its level's colour", () => {
    const out = html({ name: 'Bot Lvl 5', face: bot(5) })
    expect(out).toContain('lucide-bot')
    expect(out).toContain(botAvatarColor(5))
    expect(out).not.toContain('>B<')
  })

  it("draws a bot from the face alone, so any surface handed a seat's face shows it", () => {
    const out = html({ name: 'Bot Lvl 5', face: bot(5), guest: true })
    expect(out).toContain('lucide-bot')
    expect(out).toContain(botAvatarColor(5))
  })

  it('still shows the robot glyph under accent and quiet tones, which override the level colour same as a name colour', () => {
    const accent = html({ name: 'Bot Lvl 8', face: bot(8), tone: 'accent' })
    expect(accent).toContain('lucide-bot')
    expect(accent).toContain('bg-accent')
    const quiet = html({ name: 'Bot Lvl 8', face: bot(8), tone: 'quiet' })
    expect(quiet).toContain('lucide-bot')
    expect(quiet).toContain('bg-line-3')
  })

  it('keeps its level colour even when guest=true — a bot has no account either, so a caller that derives guest from userId===null naturally passes it for a bot seat too', () => {
    const out = html({ name: 'Bot Lvl 3', face: bot(3), guest: true })
    expect(out).toContain('lucide-bot')
    expect(out).toContain(botAvatarColor(3))
    expect(out).not.toContain('border-dashed')
  })

  it('a human guest still gets the dashed guest chip (no bot set)', () => {
    const out = html({ name: 'Lena', face: null, guest: true })
    expect(out).toContain('border-dashed')
    expect(out).not.toContain('lucide-bot')
  })

  it("draws the background finish, then the foreground finish, instead of the initial, when avatar.kind is 'preset'", () => {
    const out = html({ name: 'Lena', face: { userId: null, avatar: { kind: 'preset', foreground: 'gold', background: 'neon' } } })
    expect(out).not.toContain('>L<')
    expect(out).not.toContain(avatarColor('Lena'))
    const bg = out.indexOf('href="#finish-bg-neon"')
    expect(bg).toBeGreaterThan(-1)
    expect(out.indexOf('href="#finish-fg-gold"')).toBeGreaterThan(bg)
  })

  it("shows the picture as chosen even under tone='accent' or 'quiet' — a chosen avatar is never hidden behind a forced chip colour", () => {
    const accent = html({
      name: 'Lena',
      face: { userId: null, avatar: { kind: 'preset', foreground: 'chalk', background: 'lava' } },
      tone: 'accent',
    })
    expect(accent).toContain('#finish-fg-chalk')
    expect(accent).not.toContain('bg-accent')
    const quiet = html({
      name: 'Lena',
      face: { userId: null, avatar: { kind: 'preset', foreground: 'chalk', background: 'lava' } },
      tone: 'quiet',
    })
    expect(quiet).toContain('#finish-bg-lava')
    expect(quiet).not.toContain('bg-line-3')
  })

  it("shows the uploaded photo instead of the initial, when avatar.kind is 'upload'", () => {
    const out = html({ name: 'Lena', face: { userId: 'lena', avatar: { kind: 'upload', version: 3 } } })
    expect(out).toContain('src="/api/users/lena/avatar?v=3"')
    expect(out).not.toContain('>L<')
  })

  it("falls back to the initial when avatar.kind is 'upload' but no userId was given", () => {
    const out = html({ name: 'Lena', face: { userId: null, avatar: { kind: 'upload', version: 3 } } })
    expect(out).not.toContain('<img')
    expect(out).toContain('>L<')
  })

  it("avatar.kind: 'none' (or no face at all) shows the initial, same as today", () => {
    expect(html({ name: 'Lena', face: { userId: null, avatar: { kind: 'none' } } })).toContain('>L<')
    expect(html({ name: 'Lena', face: null })).toContain('>L<')
  })

  it('a bot glyph still wins over a preset or uploaded avatar — the more specific identity', () => {
    const preset = html({
      name: 'Bot Lvl 4',
      face: { userId: null, bot: { level: 4 }, avatar: { kind: 'preset', foreground: 'classic', background: 'classic' } },
    })
    expect(preset).toContain('lucide-bot')
    expect(preset).not.toContain('#finish-')
    const upload = html({ name: 'Bot Lvl 4', face: { userId: 'x', bot: { level: 4 }, avatar: { kind: 'upload', version: 1 } } })
    expect(upload).toContain('lucide-bot')
    expect(upload).not.toContain('<img')
  })
})
