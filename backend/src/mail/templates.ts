import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import mjml2html from 'mjml'
import type { Mail } from './transport.js'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Compiled once at module load (ESM top-level await), not per send.
const __dirname = dirname(fileURLToPath(import.meta.url))
const layoutSource = readFileSync(join(__dirname, 'templates', 'layout.mjml'), 'utf8')
const { html: layoutHtml, errors: layoutErrors } = await mjml2html(layoutSource, { validationLevel: 'strict' })
if (layoutErrors.length) throw new Error(`mail layout failed to compile: ${JSON.stringify(layoutErrors)}`)

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
    'Open this link to delete your account. This cannot be undone:',
    'Delete my account',
    'danger',
    url,
    "If you didn't ask for this, ignore this mail and change your password.",
  )
