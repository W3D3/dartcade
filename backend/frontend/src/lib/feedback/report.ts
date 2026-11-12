import { hrefs } from '$lib/routes'
// The bug report dialog (the Report a bug button, Settings): one store both entry points open, the page's
// screenshot taken once it is open (the dialog left out of it), and the payload POST /api/feedback takes.
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

/** The open dialog: the screenshot as a JPEG data URL once taken, null while `capturing` or when taking it failed. */
export type FeedbackDialogState = { screenshot: string | null; capturing: boolean; captureFailed: boolean }
export const feedbackDialog = writable<FeedbackDialogState | null>(null)

/** Marks a control the screenshot hides (the report button itself), keeping its space so the layout holds. */
export const SCREENSHOT_SKIP_ATTR = 'data-screenshot-skip'
/** Marks what the screenshot leaves out: the dialog itself and the hidden SVG sprites (thousands of nodes the screenshot clones for nothing). */
export const SCREENSHOT_OMIT_ATTR = 'data-screenshot-omit'

export function hideSkipped(clone: Node): void {
  if (clone instanceof HTMLElement && clone.hasAttribute(SCREENSHOT_SKIP_ATTR)) clone.style.visibility = 'hidden'
}

export const keepInScreenshot = (node: Node): boolean => !(node instanceof Element && node.hasAttribute(SCREENSHOT_OMIT_ATTR))

/** The scale that keeps a screenshot at most `MAX_WIDTH` wide, never above 1 (a phone's pixel ratio is not wanted). */
export const screenshotScale = (viewportWidth: number): number => Math.min(1, MAX_WIDTH / viewportWidth)

/** The page as a JPEG data URL, at most 1600 px wide. */
async function captureScreenshot(): Promise<string> {
  const url = await domToJpeg(document.body, {
    scale: screenshotScale(window.innerWidth),
    quality: 0.7,
    filter: keepInScreenshot,
    onCloneEachNode: hideSkipped,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  })
  if (url.length > MAX_SCREENSHOT) throw new Error('screenshot too large')
  return url
}

const nextFrames = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

// Which opening is current: a screenshot that finishes after the dialog closed (or reopened) is dropped
let opening = 0

/** Opens the dialog at once, then takes the page's screenshot (the dialog is left out of it) and shows it when ready. */
export async function openFeedback(
  capture: () => Promise<string> = captureScreenshot,
  afterPaint: () => Promise<void> = nextFrames,
): Promise<void> {
  const mine = ++opening
  feedbackDialog.set({ screenshot: null, capturing: true, captureFailed: false })
  await afterPaint()
  if (mine !== opening) return
  try {
    const screenshot = await capture()
    if (mine === opening) feedbackDialog.set({ screenshot, capturing: false, captureFailed: false })
  } catch {
    if (mine === opening) feedbackDialog.set({ screenshot: null, capturing: false, captureFailed: true })
  }
}

export function closeFeedback(): void {
  opening++
  feedbackDialog.set(null)
}

/** What the browser sends along: where the user is and what they run. */
export function pageContext(): FeedbackContext {
  return {
    route: location.hash || hrefs.home(),
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
