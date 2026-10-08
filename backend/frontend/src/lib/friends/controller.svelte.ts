// What the Friends page and the Friends drawer do with a friend or a request: one action at a
// time, the refusal to show, and "leave your lobby to join theirs?" before a Join that needs it.
import { push } from 'svelte-spa-router'
import { api } from '$lib/api'
import type { Friend } from '$lib/api/lobby-ws'
import { answerRequest, cancelRequest, inviteFriend, joinFriend, removeFriend } from './actions'

export type Switching = { lobbyId: string; lobbyName: string; from: string }

export function createFriendActions(myLobbyId: () => string | null) {
  // A refused action (a Join the row was too old for, say); the row itself updates from the next push
  let error = $state('')
  let busy = $state(false)
  let switching = $state<Switching | null>(null)

  async function once(run: () => Promise<string | null>): Promise<string | null> {
    if (busy) return null
    busy = true
    try {
      const err = await run()
      error = err ?? ''
      return err
    } finally {
      busy = false
    }
  }

  async function join(lobbyId: string, lobbyName: string): Promise<string | null> {
    const r = await joinFriend(lobbyId)
    if (r.kind === 'joined') {
      void push('/lobby')
      return null
    }
    if (r.kind === 'switch') {
      switching = { lobbyId, lobbyName, from: r.from }
      return null
    }
    return r.text
  }

  return {
    get error() {
      return error
    },
    get busy() {
      return busy
    },
    /** The Join waiting for "leave your lobby first?". */
    get switching() {
      return switching
    },
    once,
    invite: (f: Friend) =>
      once(() => {
        const id = myLobbyId()
        return id ? inviteFriend(id, f.id) : Promise.resolve(null)
      }),
    remove: (f: Friend) => once(() => removeFriend(f.id)),
    answer: (id: string, a: 'accept' | 'decline') => once(() => answerRequest(id, a)),
    cancel: (id: string) => once(() => cancelRequest(id)),
    join: (f: Friend) => once(() => (f.status.kind === 'lobby' ? join(f.status.lobbyId, f.status.lobbyName) : Promise.resolve(null))),
    leaveAndJoin: () => {
      const s = switching
      switching = null
      if (!s) return
      return once(async () => {
        const left = await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
        // 404: we'd already left it; anything else, stop rather than ask again
        if (left.error && left.response.status !== 404) return left.error.error
        return join(s.lobbyId, s.lobbyName)
      })
    },
    stopSwitch: () => {
      switching = null
    },
  }
}
