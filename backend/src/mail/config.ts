export type MailConfig = { smtpUrl: string; from: string; verification: boolean } | { smtpUrl: null; from: null; verification: false }

/** Mail and email verification for this deployment, from env (see DEVELOPMENT.md). Throws on a combination that can't work. */
export function resolveMailConfig(env: Record<string, string | undefined>): MailConfig {
  const smtpUrl = env.SMTP_URL?.trim() || null
  const mode = env.EMAIL_VERIFICATION?.trim() || (smtpUrl ? 'required' : 'off')
  if (mode !== 'required' && mode !== 'off') throw new Error(`EMAIL_VERIFICATION must be "required" or "off", not "${mode}"`)
  if (!smtpUrl) {
    if (mode === 'required') throw new Error('EMAIL_VERIFICATION=required needs SMTP_URL to send the links')
    return { smtpUrl: null, from: null, verification: false }
  }
  const from = env.MAIL_FROM?.trim()
  if (!from) throw new Error('SMTP_URL is set but MAIL_FROM is not')
  return { smtpUrl, from, verification: mode === 'required' }
}
