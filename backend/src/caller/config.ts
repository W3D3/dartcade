// Voice pack settings from the environment.

const DEFAULT_MB = 50

/** VOICE_STORAGE_LIMIT_MB: how much one user's packs may hold (default 50; 0 turns imports off). */
export function voiceConfig(env: NodeJS.ProcessEnv = process.env): { limitBytes: number } {
  const raw = env.VOICE_STORAGE_LIMIT_MB?.trim()
  const mb = raw ? Number(raw) : NaN
  const valid = Number.isFinite(mb) && mb >= 0
  return { limitBytes: Math.floor((valid ? mb : DEFAULT_MB) * 1024 * 1024) }
}
