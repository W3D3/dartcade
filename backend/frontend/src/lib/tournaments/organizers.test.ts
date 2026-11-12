import { describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('$lib/api', () => ({ api: { POST: post } }))

import { addPicked, organizerLine } from './organizers'

const now = new Date('2026-11-12T12:00:00')

describe('organizerLine', () => {
  it('names the owner, then when each organizer was added', () => {
    expect(organizerLine({ role: 'owner', addedAt: null }, now)).toBe('Owner')
    expect(organizerLine({ role: 'organizer', addedAt: '2026-11-10T09:00:00' }, now)).toBe('Organizer · added 2 days ago')
    expect(organizerLine({ role: 'organizer', addedAt: '2026-11-11T09:00:00' }, now)).toBe('Organizer · added yesterday')
    expect(organizerLine({ role: 'organizer', addedAt: '2026-11-12T08:00:00' }, now)).toBe('Organizer · added today')
  })
})

describe('addPicked', () => {
  it('adds each pick and reports only those the server refused', async () => {
    post.mockImplementation((_path: string, { body }: { body: { userId: string } }) =>
      Promise.resolve(body.userId === 'b' ? { error: { error: 'they are an organizer already' } } : { data: {} }),
    )
    const picks = [
      { id: 'a', name: 'Max', avatar: { kind: 'none' as const }, detail: 'Friend' },
      { id: 'b', name: 'Lena', avatar: { kind: 'none' as const }, detail: 'Friend' },
    ]
    expect(await addPicked('t1', picks)).toEqual(['Could not add Lena as organizer: they are an organizer already'])
    expect(post).toHaveBeenCalledTimes(2)
  })
})
