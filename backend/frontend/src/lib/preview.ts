// The pull request a preview deployment was built from (null in production), for the PR badge.
import { api } from '$lib/api'
import { loadOnce } from './loadOnce.js'

export const preview = loadOnce(async () => {
  const { data } = await api.GET('/api/preview')
  if (!data) throw new Error('no preview info')
  return data.preview
}, null)
