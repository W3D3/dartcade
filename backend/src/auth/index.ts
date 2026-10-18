import { betterAuth } from 'better-auth'
import { db } from '../db/index.js'
import { resolveMailConfig } from '../mail/config.js'
import { createMailer } from '../mail/transport.js'
import { authOptions } from './options.js'

const trustedOrigins =
  process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',')
    .map(s => s.trim())
    .filter(Boolean) ?? []

export const mailConfig = resolveMailConfig(process.env)
const mailer = createMailer(mailConfig, (message, details) => console.warn(message, details))

export const auth = betterAuth(authOptions({ db, mail: mailConfig, mailer, trustedOrigins }))
