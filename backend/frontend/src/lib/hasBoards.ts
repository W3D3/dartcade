// Whether you've paired a board, for the side nav's Connect your board card; null until known.
// The Boards page sets it whenever its list changes.
import { api } from '$lib/api'
import { loadOnce } from './loadOnce.js'

export const hasBoards = loadOnce<boolean | null>(async () => {
  const { data } = await api.GET('/api/boards')
  if (!data) throw new Error('no boards list')
  return data.boards.length > 0
}, null)
