// Online or Invisible: friends see Invisible as offline. Lobbies, invites and games don't change.
import { api } from './api'
import { currentUser } from './auth.js'

export const STATUS_COPY = {
  /** The account menu (User-Badge). */
  menu: {
    online: "Friends see that you're on and what you play.",
    invisible: 'You appear offline. You can still play, join lobbies and see your friends.',
  },
  /** The Friends page's "Your status" card. */
  page: {
    online: "Friends see that you're online and which game or lobby you're in.",
    invisible: 'Friends see you as offline. People in your lobby still see you, and you can still play and get invites.',
  },
  /** The same card on phones (Friends-Phone): the shorter wording that fits there. */
  phone: {
    online: "Friends see that you're online and what you play.",
    invisible: 'You appear offline. Your lobby still sees you.',
  },
}

type Patch = (invisible: boolean) => Promise<{ error?: { error: string } }>
const patchMe: Patch = (invisible) => api.PATCH('/api/me', { body: { invisible } })

/** Saves the choice; resolves with an error message, or null. */
export async function setInvisible(invisible: boolean, patch: Patch = patchMe): Promise<string | null> {
  const res = await patch(invisible)
  if (res.error) return res.error.error
  await currentUser.refresh()
  return null
}

/** What a status pick's `onchange` reports back: the error, or null — right away, or once settled. */
export type StatusPickResult = string | null | Promise<string | null>

/**
 * Runs a status pick through `onchange`. SegmentedControl writes its own `value` locally on
 * every pick (right for its other, synchronous, always-succeed callers); on an async change that
 * fails, the real `invisible` prop never changes, so nothing re-syncs that local value on its
 * own. When `onchange` reports an error this way, `onRevert` lets the caller discard that stale
 * local value (e.g. by re-keying the control) so it shows the confirmed choice again.
 */
export async function applyStatusPick(
  onchange: (invisible: boolean) => StatusPickResult,
  invisible: boolean,
  onRevert: () => void,
): Promise<void> {
  const result = onchange(invisible)
  const err = result instanceof Promise ? await result : result
  if (err) onRevert()
}
