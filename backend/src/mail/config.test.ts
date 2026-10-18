import { describe, it, expect } from 'vitest'
import { resolveMailConfig } from './config.js'

const smtp = { SMTP_URL: 'smtp://mailpit:1025', MAIL_FROM: 'Dartcade <noreply@x.org>' }

describe('resolveMailConfig', () => {
  it('turns verification on when SMTP is set', () => {
    expect(resolveMailConfig(smtp)).toEqual({ smtpUrl: smtp.SMTP_URL, from: smtp.MAIL_FROM, verification: true })
  })
  it('lets a deployment with SMTP turn verification off', () => {
    expect(resolveMailConfig({ ...smtp, EMAIL_VERIFICATION: 'off' }).verification).toBe(false)
  })
  it('is mail off and verification off without SMTP', () => {
    expect(resolveMailConfig({})).toEqual({ smtpUrl: null, from: null, verification: false })
    expect(resolveMailConfig({ EMAIL_VERIFICATION: 'off' }).verification).toBe(false)
  })
  it('refuses required verification without SMTP, naming both variables', () => {
    expect(() => resolveMailConfig({ EMAIL_VERIFICATION: 'required' })).toThrow(/EMAIL_VERIFICATION.*SMTP_URL/)
  })
  it('refuses SMTP without MAIL_FROM and an unknown mode', () => {
    expect(() => resolveMailConfig({ SMTP_URL: smtp.SMTP_URL })).toThrow(/MAIL_FROM/)
    expect(() => resolveMailConfig({ ...smtp, EMAIL_VERIFICATION: 'yes' })).toThrow(/required.*off/)
  })
})
