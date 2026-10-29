// The Boards page's board-sharing requests: invites to accept/decline, and an owner's grantee
// list. Each resolves with the server's refusal message, if any, following lib/friends/actions.ts
// and lib/admin/flags.ts's style.
import { api } from '$lib/api'
import type { BoardGrantee, IncomingBoardShare } from '$lib/api'

export type { BoardGrantee, IncomingBoardShare }

export async function listIncomingBoardShares(): Promise<IncomingBoardShare[]> {
  const { data } = await api.GET('/api/board-shares/incoming')
  return data?.shares ?? []
}

export async function acceptBoardShare(id: string): Promise<string | null> {
  const res = await api.POST('/api/board-shares/{id}/accept', { params: { path: { id } } })
  return res.error ? res.error.error : null
}

export async function declineBoardShare(id: string): Promise<string | null> {
  const res = await api.POST('/api/board-shares/{id}/decline', { params: { path: { id } } })
  return res.error ? res.error.error : null
}

export async function listBoardShares(boardId: string): Promise<BoardGrantee[]> {
  const { data } = await api.GET('/api/boards/{id}/shares', { params: { path: { id: boardId } } })
  return data?.shares ?? []
}

export async function shareBoard(boardId: string, friendUserId: string): Promise<string | null> {
  const res = await api.POST('/api/boards/{id}/shares', { params: { path: { id: boardId } }, body: { friendUserId } })
  return res.error ? res.error.error : null
}

export async function revokeBoardShare(boardId: string, shareId: string): Promise<string | null> {
  const res = await api.DELETE('/api/boards/{id}/shares/{shareId}', { params: { path: { id: boardId, shareId } } })
  return res.error ? res.error.error : null
}
