import nodemailer from 'nodemailer'
import type { MailConfig } from './config.js'

export type Mail = {
  to: string
  subject: string
  text: string
  html: string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}
export type Mailer = { send(mail: Mail): void }

/** An address under RFC 2606's .invalid, like a Discord account's stand-in (auth/discord.ts): nothing can receive it. */
export const undeliverable = (to: string) => /\.invalid$/i.test(to.trim())

/** One SMTP transport for the process; null when the deployment has no mail. Sends without awaiting, so timing never shows whether an address has an account. */
export function createMailer(config: MailConfig, warn: (msg: string, details: unknown) => void): Mailer | null {
  if (!config.smtpUrl) return null
  const transport = nodemailer.createTransport(config.smtpUrl)
  const from = config.from
  return {
    send: mail => {
      if (undeliverable(mail.to)) {
        warn('mail skipped: undeliverable address', { to: mail.to, subject: mail.subject })
        return
      }
      transport.sendMail({ from, ...mail }).catch((err: unknown) => {
        warn('mail send failed', { to: mail.to, subject: mail.subject, error: String(err) })
      })
    },
  }
}
