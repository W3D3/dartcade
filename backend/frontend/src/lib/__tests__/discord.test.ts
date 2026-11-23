import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import DiscordButton from '../components/DiscordButton.svelte'
import NewsCard from '../components/home/NewsCard.svelte'

const info = vi.hoisted(() => ({ discordInviteUrl: null as string | null }))

vi.mock('$lib/authInfo', async () => ({ authInfo: (await import('svelte/store')).readable(info) }))
vi.mock('$lib/home/flags', async () => ({ homeFlagOn: (await import('svelte/store')).readable(() => true) }))

const URL_ = 'https://discord.gg/TT4BKrQeM2'

describe('Join our Discord', () => {
  it('renders nothing without an invite', () => {
    info.discordInviteUrl = null
    expect(render(DiscordButton).body).not.toContain('Discord')
    expect(render(DiscordButton, { props: { variant: 'small' } }).body).not.toContain('Discord')
    expect(render(NewsCard).body).not.toContain('Discord')
  })

  it('shows the nav link and the Home tile, opening the invite in a new tab', () => {
    info.discordInviteUrl = URL_
    const row = render(DiscordButton).body
    expect(row).toContain(`href="${URL_}"`)
    expect(row).toContain('rel="noopener noreferrer"')
    expect(row).toContain('target="_blank"')
    expect(row).toContain('>Join our Discord')
    expect(render(DiscordButton, { props: { variant: 'small' } }).body).not.toContain('>Join our Discord')
    const tile = render(NewsCard).body
    expect(tile).toContain(`href="${URL_}"`)
    expect(tile).toContain('Talk darts, share feedback and find players.')
  })
})
