import { describe, it, expect } from 'vitest'
import { compileTemplate, verifyMail, resetMail, deleteMail } from './templates.js'

describe('mail templates', () => {
  const url = 'https://darts.example/api/auth/verify-email?token=t&callbackURL=%2F%23%2F'
  const cases = [
    { make: verifyMail, heading: 'Confirm your email', button: 'Confirm email', preheader: 'One click and you&#39;re in.' },
    { make: resetMail, heading: 'Reset your password', button: 'Choose a new password', preheader: 'This link is valid for an hour.' },
    { make: deleteMail, heading: 'Delete your account', button: 'Delete my account', preheader: 'This can&#39;t be undone.' },
  ]
  it.each(cases)(
    '%o carries the link, heading, button and preheader in text and html, addressed to the user',
    ({ make, heading, button, preheader }) => {
      const m = make('lena@example.com', 'Lena', url)
      expect(m.to).toBe('lena@example.com')
      expect(m.text).toContain(url)
      expect(m.text).toContain('Lena')
      expect(m.html).toContain(url.replaceAll('&', '&amp;'))
      expect(m.html).toContain(heading)
      expect(m.html).toContain(button)
      expect(m.html).toContain(preheader)
      expect(m.html).toContain('#c6f24e')
    },
  )
  it('escapes the name in html', () => {
    expect(verifyMail('a@x', '<b>x</b>', url).html).not.toContain('<b>x</b>')
  })
  it('uses the lime button for verify and reset, and the danger-red button for delete', () => {
    expect(verifyMail('a@x', 'Lena', url).html).toContain('background-color:#c6f24e')
    expect(resetMail('a@x', 'Lena', url).html).toContain('background-color:#c6f24e')
    const del = deleteMail('a@x', 'Lena', url).html
    expect(del).toContain('#ff5a4f')
    expect(del).not.toContain('background-color:#c6f24e')
  })
  it.each(['layout.mjml', 'feedback.mjml'])('compiles %s and its shared head with no MJML validation errors', async name => {
    const { html, errors } = await compileTemplate(name)
    expect(errors).toEqual([])
    expect(html).toContain('Instrument Sans')
  })
  it('has no newline inside any style attribute, and the button stays styled and legible', () => {
    for (const [make, color] of [
      [verifyMail, '#0f100e'],
      [resetMail, '#0f100e'],
      [deleteMail, '#ff5a4f'],
    ] as const) {
      const html = make('a@x', 'Lena', url).html
      for (const [, style] of html.matchAll(/style="([^"]*)"/g)) expect(style).not.toContain('\n')
      const buttonStyle = html.match(/letter-spacing:0\.08em[^"]*/)?.[0] ?? ''
      expect(buttonStyle).toContain(`color:${color}`)
      expect(buttonStyle).toContain('font-size:16px')
      expect(buttonStyle).not.toContain('\n')
    }
  })
  it('fills placeholders in one pass, so a name that spells out a placeholder stays literal', () => {
    const html = verifyMail('a@x', 'X {{url}} Y', url).html
    expect(html).toContain('X {{url}} Y')
    const escapedUrl = url.replaceAll('&', '&amp;')
    const occurrences = html.split(escapedUrl).length - 1
    expect(occurrences).toBe(3) // button href, fallback href, fallback display text — not a 4th from the name
  })
})
