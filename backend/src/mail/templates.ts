import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import mjml2html from 'mjml'
import type { Mail } from './transport.js'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Compiled once at module load (ESM top-level await), not per send.
const __dirname = dirname(fileURLToPath(import.meta.url))
/** Compiles a template in templates/, with its includes (the shared head.mjml). */
export async function compileTemplate(name: string): Promise<{ html: string; errors: unknown[] }> {
  const filePath = join(__dirname, 'templates', name)
  return mjml2html(readFileSync(filePath, 'utf8'), { validationLevel: 'strict', filePath, ignoreIncludes: false })
}
async function compiled(name: string): Promise<string> {
  const { html, errors } = await compileTemplate(name)
  if (errors.length) throw new Error(`mail template ${name} failed to compile: ${JSON.stringify(errors)}`)
  return html
}
const layoutHtml = await compiled('layout.mjml')
const feedbackHtml = await compiled('feedback.mjml')

// One pass over the whole template, not one pass per key: a value (e.g. a name) that itself
// contains "{{url}}" must not get re-scanned and substituted by a later key's replace.
function fill(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => (key in vars ? vars[key] : whole))
}

type ButtonVariant = 'lime' | 'danger'
const buttonStyle: Record<ButtonVariant, { bg: string; color: string; border: string }> = {
  lime: { bg: '#c6f24e', color: '#0f100e', border: 'none' },
  danger: { bg: 'transparent', color: '#ff5a4f', border: '2px solid #ff5a4f' },
}

function mail(
  to: string,
  subject: string,
  name: string,
  heading: string,
  preheader: string,
  lead: string,
  buttonLabel: string,
  buttonVariant: ButtonVariant,
  url: string,
  ignore: string,
): Mail {
  const text = `Hi ${name},\n\n${lead}\n\n${url}\n\n${ignore}\n\n— Dartcade`
  const { bg, color, border } = buttonStyle[buttonVariant]
  const html = fill(layoutHtml, {
    preheader: esc(preheader),
    heading: esc(heading),
    name: esc(name),
    lead: esc(lead),
    buttonLabel: esc(buttonLabel),
    buttonBg: bg,
    buttonColor: color,
    buttonBorder: border,
    url: esc(url),
    ignore: esc(ignore),
  })
  return { to, subject, text, html }
}

export const verifyMail = (to: string, name: string, url: string): Mail =>
  mail(
    to,
    'Confirm your email for Dartcade',
    name,
    'Confirm your email',
    "One click and you're in.",
    'Open this link to confirm your email and finish signing up:',
    'Confirm email',
    'lime',
    url,
    "If you didn't sign up, ignore this mail.",
  )
export const resetMail = (to: string, name: string, url: string): Mail =>
  mail(
    to,
    'Reset your Dartcade password',
    name,
    'Reset your password',
    'This link is valid for an hour.',
    'Open this link to choose a new password. It is valid for an hour:',
    'Choose a new password',
    'lime',
    url,
    "If you didn't ask for this, ignore this mail; your password stays as it is.",
  )
export const deleteMail = (to: string, name: string, url: string): Mail =>
  mail(
    to,
    'Confirm deleting your Dartcade account',
    name,
    'Delete your account',
    "This can't be undone.",
    "Open this link in the browser where you're signed in to Dartcade to delete your account. This cannot be undone:",
    'Delete my account',
    'danger',
    url,
    "If you didn't ask for this, ignore this mail and change your password.",
  )

export type FeedbackKind = 'bug' | 'idea' | 'other'
const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug report', idea: 'Idea', other: 'Feedback' }

/** A user's report to the operator: their message, then what was sent along with it (label, value). */
export function feedbackMail(
  to: string,
  kind: FeedbackKind,
  name: string,
  message: string,
  details: [string, string][],
  screenshot: Buffer | null,
): Mail {
  const heading = `${KIND_LABEL[kind]} from ${name}`
  const note = screenshot ? 'A screenshot of the page is attached.' : 'No screenshot.'
  const text = `${heading}\n\n${message}\n\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${note}`
  const rows = details
    .map(
      ([k, v]) =>
        `<tr style="border-top:1px solid #2a2d27;"><td style="padding:6px 12px 6px 0;color:#828379;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#efeee6;word-break:break-all;">${esc(v)}</td></tr>`,
    )
    .join('')
  const html = fill(feedbackHtml, {
    preheader: esc(message.slice(0, 120)),
    heading: esc(heading),
    message: esc(message),
    rows,
    note: esc(note),
  })
  const attachments = screenshot ? [{ filename: 'screenshot.jpg', content: screenshot, contentType: 'image/jpeg' }] : undefined
  return { to, subject: `Dartcade: ${heading}`, text, html, ...(attachments && { attachments }) }
}
