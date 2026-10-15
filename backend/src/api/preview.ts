import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

export type Preview = { pr: number; url: string } | null

/** The pull request this deployment previews (PREVIEW_PR, PREVIEW_PR_URL); null unless both are set and valid. */
export function parsePreview(env: Record<string, string | undefined>): Preview {
  const { PREVIEW_PR: pr = '', PREVIEW_PR_URL: url = '' } = env
  if (!/^[1-9]\d{0,8}$/.test(pr)) return null
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' ? { pr: Number(pr), url } : null
  } catch {
    return null
  }
}

export function previewApiPlugin(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { preview: Preview },
  done: (err?: Error) => void,
): void {
  app.get<Route<'getPreview'>>('/api/preview', { schema: fromSpec('getPreview') }, () => ({ preview: opts.preview }))
  done()
}
