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
})
