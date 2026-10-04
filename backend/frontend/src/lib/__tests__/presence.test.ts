import { describe, it, expect, vi } from 'vitest'

// vi.hoisted: the mocked refresh is asserted on directly below, rather than through
// `currentUser.refresh` (a method access eslint's unbound-method rule flags).
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn(() => Promise.resolve()) }))
vi.mock('../auth.js', () => ({ currentUser: { refresh } }))
const { setInvisible, applyStatusPick, STATUS_COPY } = await import('../presence.js')

describe('setInvisible', () => {
  it('saves the choice and reloads who you are', async () => {
    const patch = vi.fn(() => Promise.resolve({}))
    expect(await setInvisible(true, patch)).toBeNull()
    expect(patch).toHaveBeenCalledWith(true)
    expect(refresh).toHaveBeenCalled()
  })
  it('says why it failed', async () => {
    expect(await setInvisible(false, () => Promise.resolve({ error: { error: 'unauthorized' } }))).toBe('unauthorized')
  })
  it('uses the design copy', () => {
    expect(STATUS_COPY.menu.invisible).toBe('You appear offline. You can still play, join lobbies and see your friends.')
    expect(STATUS_COPY.page.online).toBe("Friends see that you're online and which game or lobby you're in.")
    expect(STATUS_COPY.phone.online).toBe("Friends see that you're online and what you play.")
    expect(STATUS_COPY.phone.invisible).toBe('You appear offline. Your lobby still sees you.')
  })
})

describe('applyStatusPick', () => {
  // StatusCard's SegmentedControl writes its own value locally on every pick; a failed change
  // never makes the real `invisible` prop change, so nothing re-syncs it on its own. This is the
  // revert signal StatusCard uses to discard that stale local value and show the confirmed one.
  it('reverts after a failed change', async () => {
    let reverted = false
    await applyStatusPick(() => Promise.resolve('nope'), true, () => { reverted = true })
    expect(reverted).toBe(true)
  })
  it('does not revert after a successful change', async () => {
    let reverted = false
    await applyStatusPick(() => Promise.resolve(null), true, () => { reverted = true })
    expect(reverted).toBe(false)
  })
  it('leaves a synchronous, successful onchange alone', async () => {
    let reverted = false
    await applyStatusPick(() => null, true, () => { reverted = true })
    expect(reverted).toBe(false)
  })
  it('reverts a synchronous, failed onchange too', async () => {
    let reverted = false
    await applyStatusPick(() => 'nope', true, () => { reverted = true })
    expect(reverted).toBe(true)
  })
})
