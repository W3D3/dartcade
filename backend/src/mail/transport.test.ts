import { describe, it, expect, vi } from 'vitest'

const sendMail = vi.fn(() => Promise.resolve())
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }))

const { createMailer } = await import('./transport.js')

describe('createMailer', () => {
  const config = { smtpUrl: 'smtp://x', from: 'x@x', verification: false } as const
  const mail = (to: string) => ({ to, subject: 'Reset your password', text: 't', html: 'h' })

  it('never sends to a .invalid address (a Discord account without an email), and says so', () => {
    const warn = vi.fn()
    const mailer = createMailer(config, warn)!
    mailer.send(mail('123456789@discord.invalid'))
    mailer.send(mail('someone@EXAMPLE.INVALID'))
    expect(sendMail).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('mail skipped: undeliverable address', expect.objectContaining({ to: '123456789@discord.invalid' }))
  })

  it('sends to a real address', () => {
    const mailer = createMailer(config, vi.fn())!
    mailer.send(mail('lena@example.org'))
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'lena@example.org', from: 'x@x' }))
  })
})
