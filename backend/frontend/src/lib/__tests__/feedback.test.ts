import { describe, it, expect, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('modern-screenshot', () => ({ domToJpeg: vi.fn() }))

import { buildReport, canSend, closeFeedback, feedbackDialog, MESSAGE_MAX, openFeedback } from '../feedback/report'

const context = {
  route: '#/game/s1',
  userAgent: 'UA',
  viewport: '390x844',
  locale: 'en-GB',
  version: 'dev',
  commit: null,
  sessionId: 's1',
}

describe('bug report', () => {
  it('builds the payload with the trimmed message, the context, and the screenshot only when ticked', () => {
    const shot = 'data:image/jpeg;base64,/9j/AAAA'
    expect(buildReport({ kind: 'bug', message: '  froze \n', includeScreenshot: true }, context, shot)).toEqual({
      kind: 'bug',
      message: 'froze',
      context,
      screenshot: '/9j/AAAA',
    })
    expect(buildReport({ kind: 'idea', message: 'x', includeScreenshot: false }, context, shot)).not.toHaveProperty('screenshot')
    expect(buildReport({ kind: 'other', message: 'x', includeScreenshot: true }, context, null)).not.toHaveProperty('screenshot')
  })

  it('sends only a message that is not blank and fits the limit', () => {
    expect(canSend('')).toBe(false)
    expect(canSend('   ')).toBe(false)
    expect(canSend('hi')).toBe(true)
    expect(canSend('x'.repeat(MESSAGE_MAX))).toBe(true)
    expect(canSend('x'.repeat(MESSAGE_MAX + 1))).toBe(false)
  })

  it('opens at once, then shows the screenshot when it is taken', async () => {
    const seen: unknown[] = []
    const unsubscribe = feedbackDialog.subscribe(v => v && seen.push({ ...v }))
    let capture: (url: string) => void = () => undefined
    const opening = openFeedback(
      () => new Promise<string>(resolve => (capture = resolve)),
      () => Promise.resolve(),
    )
    await Promise.resolve()
    expect(get(feedbackDialog)).toEqual({ screenshot: null, capturing: true, captureFailed: false })
    capture('data:image/jpeg;base64,abc')
    await opening
    unsubscribe()
    expect(get(feedbackDialog)).toEqual({ screenshot: 'data:image/jpeg;base64,abc', capturing: false, captureFailed: false })
    closeFeedback()
    expect(get(feedbackDialog)).toBeNull()
  })

  it('drops a screenshot that finishes after the dialog was closed', async () => {
    let capture: (url: string) => void = () => undefined
    const opening = openFeedback(
      () => new Promise<string>(resolve => (capture = resolve)),
      () => Promise.resolve(),
    )
    await Promise.resolve()
    closeFeedback()
    capture('data:image/jpeg;base64,late')
    await opening
    expect(get(feedbackDialog)).toBeNull()
  })

  it('opens without a screenshot, saying so, when the capture fails', async () => {
    await openFeedback(
      () => Promise.reject(new Error('tainted canvas')),
      () => Promise.resolve(),
    )
    expect(get(feedbackDialog)).toEqual({ screenshot: null, capturing: false, captureFailed: true })
    closeFeedback()
  })
})
