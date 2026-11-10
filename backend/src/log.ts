import pino, { type LoggerOptions } from 'pino'

/** One configuration for the backend's logs: Fastify's own logger and the services' `log` share it. Silent in tests. */
export const logOptions: LoggerOptions = {
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  // An Error passed as a warning's details would otherwise log as {}
  serializers: { details: pino.stdSerializers.err },
}

export const log = pino(logOptions)

/** `warn(message, details)` as the services take it. */
export function warn(message: string, details?: unknown): void {
  log.warn({ details }, message)
}
