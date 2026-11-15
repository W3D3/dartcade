// What the guest-claim dialog and invite say (the host's list of guests, the friend's invite).
import type { Friend, GuestClaimInvite } from '$lib/api/lobby-ws'
import { dayMonth, ordinal } from '$lib/fmt'
import { friendChips, friendMatches } from '$lib/lobby/friendChips'
import { getGameView } from '$lib/gameViews'
import type { GuestClaimSeat } from './actions'

/** "1st", or nothing for a game without places. */
export const placeText = (placement: number | null): string => (placement === null ? '' : ordinal(placement))

/** "Pia · 1st". */
export const seatLine = (seat: Pick<GuestClaimSeat, 'name' | 'placement'>): string =>
  [seat.name, placeText(seat.placement)].filter(Boolean).join(' · ')

/** "X01 · 1 Nov", the game as the friend's invite names it. */
export const gameLine = (invite: Pick<GuestClaimInvite, 'mode' | 'playedAt'>): string =>
  `${getGameView(invite.mode).title} · ${dayMonth(new Date(invite.playedAt))}`

/** The invite card's headline. */
export const inviteTitle = (invite: GuestClaimInvite): string => `${invite.host.name} asks you to take over ${invite.seatName}`

/**
 * The friends the picker offers for a seat: only friends (online first, or those whose name starts
 * with what is typed), never one already asked for another seat of the game.
 */
export function friendOptions(friends: Friend[], query: string, exclude: readonly string[]): Friend[] {
  const ids =
    query.trim() === ''
      ? friendChips(friends, exclude, friends.length).map(c => c.id)
      : friendMatches(friends, query, exclude).map(f => f.id)
  return ids.flatMap(id => friends.filter(f => f.id === id))
}

/** Friends already asked for some seat: they can't be asked for another one of the same game. */
export const askedFriends = (seats: GuestClaimSeat[], exceptSeat: number): string[] =>
  seats.flatMap(s => (s.seat !== exceptSeat && s.invite ? [s.invite.user.id] : []))
