import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { parsePreview, previewApiPlugin, type Preview } from './preview.js'

const URL_145 = 'https://github.com/W3D3/dartcade/pull/145'

describe('parsePreview', () => {
  it('is the pull request when both variables are set', () => {
    expect(parsePreview({ PREVIEW_PR: '145', PREVIEW_PR_URL: URL_145 })).toEqual({ pr: 145, url: URL_145 })
  })

  it('is null outside a preview (neither set) and with only one of them', () => {
    expect(parsePreview({})).toBeNull()
    expect(parsePreview({ PREVIEW_PR: '145' })).toBeNull()
    expect(parsePreview({ PREVIEW_PR_URL: URL_145 })).toBeNull()
  })

  it('is null for a number that is not a PR id or a URL that is not http(s)', () => {
    for (const pr of ['', '0', '-1', '1.5', '1e2', 'abc', '{pr_id}'])
      expect(parsePreview({ PREVIEW_PR: pr, PREVIEW_PR_URL: URL_145 })).toBeNull()
    for (const url of ['', 'not a url', 'javascript:alert(1)', 'ftp://example.com/x'])
      expect(parsePreview({ PREVIEW_PR: '145', PREVIEW_PR_URL: url })).toBeNull()
  })
})

describe('GET /api/preview', () => {
  const get = async (preview: Preview) => {
    const app = createFastify()
    await app.register(previewApiPlugin, { preview })
    const res = await app.inject({ method: 'GET', url: '/api/preview' })
    return { status: res.statusCode, body: res.json() }
  }

  it('answers the pull request, signed out', async () => {
    expect(await get({ pr: 145, url: URL_145 })).toEqual({ status: 200, body: { preview: { pr: 145, url: URL_145 } } })
  })

  it('answers null in production', async () => {
    expect(await get(null)).toEqual({ status: 200, body: { preview: null } })
  })
})
