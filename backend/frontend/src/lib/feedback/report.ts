// The bug report dialog (Alpha badge, Settings): one store both entry points open, the page's
// screenshot taken before the dialog covers it, and the payload POST /api/feedback takes.
import { domToJpeg } from 'modern-screenshot'
import { get, writable } from 'svelte/store'
import type { components } from '$lib/api/schema'
import { activeSessionId } from '$lib/activeSession'
import { SPA_BUILD } from '$lib/version'

export type FeedbackReport = components['schemas']['FeedbackReport']
export type FeedbackContext = FeedbackReport['context']
export type FeedbackForm = { kind: FeedbackReport['kind']; message: string; includeScreenshot: boolean }

export const MESSAGE_MAX = 4000
const MAX_WIDTH = 1600
// The spec's screenshot limit (base64 characters)
const MAX_SCREENSHOT = 2_800_000

/** The open dialog: the screenshot as a JPEG data URL, or null and whether taking it failed. */
export const feedbackDialog = writable<{ screenshot: string | null; captureFailed: boolean } | null>(null)

/** The page as a JPEG data URL, at most 1600 px wide. */
export async function captureScreenshot(): Promise<string> {
  const url = await domToJpeg(document.body, {
    scale: Math.min(1, MAX_WIDTH / window.innerWidth),
    quality: 0.7,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  })
  if (url.length > MAX_SCREENSHOT) throw new Error('screenshot too large')
  return url
}

/** Takes the screenshot first, so the dialog isn't in it, then opens the dialog with or without it. */
export async function openFeedback(capture: () => Promise<string> = captureScreenshot): Promise<void> {
  try {
    feedbackDialog.set({ screenshot: await capture(), captureFailed: false })
  } catch {
    feedbackDialog.set({ screenshot: null, captureFailed: true })
  }
}

export const closeFeedback = (): void => feedbackDialog.set(null)

/** What the browser sends along: where the user is and what they run. */
export function pageContext(): FeedbackContext {
  return {
    route: location.hash || '#/',
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    locale: navigator.language,
    version: SPA_BUILD.version,
    commit: SPA_BUILD.commit,
    sessionId: get(activeSessionId),
  }
}

export const canSend = (message: string): boolean => message.trim().length > 0 && message.length <= MESSAGE_MAX

export function buildReport(form: FeedbackForm, context: FeedbackContext, screenshot: string | null): FeedbackReport {
  const report: FeedbackReport = { kind: form.kind, message: form.message.trim(), context }
  if (form.includeScreenshot && screenshot) report.screenshot = screenshot.slice(screenshot.indexOf(',') + 1)
  return report
}
