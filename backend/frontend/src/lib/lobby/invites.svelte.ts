// Answering a lobby invite, for the Invites page, the invite toast and the friends drawer.
// Accepting while you're in another lobby asks you to leave it first (your guests leave with you).
import { push } from 'svelte-spa-router'
import { api } from '$lib/api'
import type { PendingInvite } from '$lib/api/lobby-ws'
import { describeConflict, type Refusal } from './input'

export class InviteActions {
  error = $state('')
  /** Your game is running: finish or end it before accepting. */
  runningSessionId = $state<string | null>(null)
  /** Accepting needs you to leave this lobby first: the confirm is open. */
  switching = $state<{ invite: PendingInvite; from: string } | null>(null)
  /** An accept or decline in flight: the buttons wait, so a double tap sends one. */
  busy = $state(false)

  private async once(run: () => Promise<void>) {
    if (this.busy) return
    this.busy = true
    try {
      await run()
    } finally {
      this.busy = false
    }
  }

  private async sendAccept(invite: PendingInvite) {
    this.error = ''
    this.runningSessionId = null
    const res = await api.POST('/api/invites/{id}/accept', { params: { path: { id: invite.id } } })
    if (res.data) {
      void push('/lobby')
      return
    }
    const r: Refusal = res.error
    if (r.code === 'in_lobby' && r.lobbyId) this.switching = { invite, from: r.lobbyId }
    else {
      this.error = describeConflict(r)
      if (r.code === 'active_session' && r.sessionId) this.runningSessionId = r.sessionId
    }
  }

  accept = (invite: PendingInvite) => this.once(() => this.sendAccept(invite))

  /** The confirm's yes: leave the current lobby, then accept. */
  leaveAndAccept = () => {
    const s = this.switching
    this.switching = null
    if (!s) return
    return this.once(async () => {
      await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
      await this.sendAccept(s.invite)
    })
  }

  decline = (invite: PendingInvite) =>
    this.once(async () => {
      const res = await api.POST('/api/invites/{id}/decline', { params: { path: { id: invite.id } } })
      this.runningSessionId = null
      this.error = res.error ? describeConflict(res.error) : ''
    })
}

/** The lobby accepting this invite takes you out of: its name, or null when you're in none (or in that one). */
export function leavingFor(lobby: { id: string; name: string } | null | undefined, invite: PendingInvite): string | null {
  return lobby && lobby.id !== invite.lobbyId ? lobby.name : null
}
