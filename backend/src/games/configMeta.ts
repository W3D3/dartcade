import type { ConfigFieldMeta } from '../session/types.js'

/**
 * A client's config against its fields' options: each field that has options must hold one of them,
 * strictly (so '121' isn't 121). The first that doesn't gives `Unknown <label>`; null when all do.
 * `skip`: fields checked another way. `allowMissing`: an absent field is fine (it plays its default).
 */
export function validateOptions(
  cfg: Record<string, unknown>,
  meta: Record<string, ConfigFieldMeta>,
  { skip = [], allowMissing = false }: { skip?: string[]; allowMissing?: boolean } = {},
): string | null {
  for (const [key, field] of Object.entries(meta)) {
    if (!field.options || skip.includes(key) || (allowMissing && cfg[key] === undefined)) continue
    if (!field.options.some(o => o.value === cfg[key])) return `Unknown ${field.label.toLowerCase()}`
  }
  return null
}
