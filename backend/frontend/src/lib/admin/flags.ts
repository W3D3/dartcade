// Admin feature flags: list every flag and its override, and change it at runtime, no restart
// (schema/api-v1.yaml, tag admin). The pure parts turn an AdminFlag row into the segmented
// control's value and back; the page (AdminFlags.svelte) wires them to the API.
import { api, type AdminFlag } from '$lib/api'
import { inviteTime } from '$lib/lobby/format'
import { PALETTE } from '$lib/details/chartColors'

export type { AdminFlag }

/** The segmented control's value: a stored override's mode, or 'default' with none. */
export type FlagMode = 'default' | 'off' | 'admins' | 'users' | 'on'

/** Every flag, its default/override/value, and override rows whose key no longer matches a flag.
 *  Null: the request failed. */
export async function listFlags(): Promise<{ flags: AdminFlag[]; stale: { key: string; updatedAt: string }[] } | null> {
  const res = await api.GET('/api/admin/flags')
  return res.data ?? null
}

/** A boolean flag's current control value. */
export function flagMode(flag: AdminFlag): FlagMode {
  return flag.override?.mode ?? 'default'
}

/** What "Default" means for this flag right now, e.g. "Default (admins)". */
export function defaultLabel(flag: AdminFlag): string {
  if (flag.default.envOn) return 'Default (everyone)'
  return flag.default.rule === 'admins' ? 'Default (admins)' : 'Default (off)'
}

/** The users chosen for a 'users'-mode override; empty otherwise. */
export function flagUsers(flag: AdminFlag): { id: string; name: string | null }[] {
  return flag.override?.users ?? []
}

/** A number flag's value without an override: the deployment value, else its code default. */
export function numberDefault(flag: AdminFlag): number {
  return flag.default.envValue ?? flag.default.value ?? 0
}

/** A number flag's current value: its override, else its default. */
export function flagNumber(flag: AdminFlag): number {
  return typeof flag.override?.number === 'number' ? flag.override.number : numberDefault(flag)
}

/** "Changed by NAME, 5 min ago"; null when the flag has no stored override. */
export function overrideLine(flag: AdminFlag, now: Date): string | null {
  const o = flag.override
  if (!o) return null
  const name = o.updatedBy?.name ?? 'Deleted user'
  return `Changed by ${name}, ${inviteTime(o.updatedAt, now)}`
}

/** The table's "changed" column: compact (no "Changed by" — the header already says that),
 *  "—" with no override. The panel's footer keeps the fuller overrideLine. */
export function changedCellText(flag: AdminFlag, now: Date): string {
  const o = flag.override
  if (!o) return '—'
  const name = o.updatedBy?.name ?? 'Deleted user'
  return `${name} · ${inviteTime(o.updatedAt, now)}`
}

/** A number flag's unit, guessed from its key's last camelCase word ("visitSeconds" -> "s"); '' if none is obvious. */
function numberUnit(key: string): string {
  if (/Seconds$/.test(key)) return 's'
  if (/Percent$/.test(key)) return '%'
  return ''
}

/** The table's "your value" column: on/off for a boolean flag, else the number with its unit. */
export function flagValueText(flag: AdminFlag): string {
  return typeof flag.value === 'boolean' ? (flag.value ? 'On' : 'Off') : `${flag.value}${numberUnit(flag.key)}`
}

/** The table's "state" column: who a boolean flag is on for, or a number flag's value. */
export function flagStateText(flag: AdminFlag): string {
  if (flag.kind === 'number') return flagValueText(flag)
  switch (flagMode(flag)) {
    case 'on':
      return 'Everyone'
    case 'off':
      return 'Off'
    case 'admins':
      return 'Admins'
    case 'users':
      return `Chosen users · ${flagUsers(flag).length}`
    default:
      return defaultLabel(flag)
  }
}

/** The table's "source" column: where the current value comes from. */
export function flagSourceText(flag: AdminFlag): string {
  if (flag.override) return 'Override'
  if (flag.kind === 'boolean') return flag.default.envOn ? 'FLAGS_ON' : 'Rule'
  return flag.default.envValue != null ? 'FLAG_VALUES' : 'Rule'
}

/** The PUT body for a mode other than 'default' (clear the override for that one instead). */
export function modeBody(
  mode: Exclude<FlagMode, 'default'>,
  userIds: string[],
): { mode: Exclude<FlagMode, 'default'>; userIds?: string[] } {
  return mode === 'users' ? { mode, userIds } : { mode }
}

/** The panel's local, unsaved copy of a flag's setting. A boolean flag's mode/chosen users, or a
 *  number flag's value ('isDefault' when it's cleared back to the deployment/code default, since
 *  that's a DELETE regardless of what number it falls back to). */
export type FlagDraft = { kind: 'boolean'; mode: FlagMode; userIds: string[] } | { kind: 'number'; isDefault: boolean; number: number }

/** The draft that matches a flag's current server state (open a panel, or compare against to tell
 *  whether it's been edited). */
export function draftFromFlag(flag: AdminFlag): FlagDraft {
  if (flag.kind === 'number') return { kind: 'number', isDefault: !flag.override, number: flagNumber(flag) }
  return { kind: 'boolean', mode: flagMode(flag), userIds: flagUsers(flag).map(u => u.id) }
}

/** Whether the draft has changed anything from the flag's current server state. */
export function isDirty(flag: AdminFlag, draft: FlagDraft): boolean {
  if (draft.kind === 'number') return draft.isDefault !== !flag.override || (!draft.isDefault && draft.number !== flagNumber(flag))
  if (draft.mode !== flagMode(flag)) return true
  if (draft.mode !== 'users') return false
  const before = flagUsers(flag)
    .map(u => u.id)
    .slice()
    .sort()
  const after = draft.userIds.slice().sort()
  return before.length !== after.length || before.some((id, i) => id !== after[i])
}

/** A number draft's validation error (empty/not-a-number, or outside the flag's range); null when
 *  it's fine to save. */
export function numberDraftError(flag: AdminFlag, value: number): string | null {
  if (!Number.isFinite(value)) return 'Enter a number'
  const [min, max] = flag.range ?? [-Infinity, Infinity]
  if (value < min || value > max) return `Enter a number between ${min} and ${max}`
  return null
}

/** Whether the draft is one Save could send: a 'users' draft needs at least one chosen user, and
 *  a non-default number draft must be in range. */
export function isValid(flag: AdminFlag, draft: FlagDraft): boolean {
  if (draft.kind === 'number') return draft.isDefault || numberDraftError(flag, draft.number) === null
  return draft.mode !== 'users' || draft.userIds.length > 0
}

/** What Save should send for a draft: DELETE for a default draft, else the PUT request. */
export type FlagRequest =
  | { kind: 'delete' }
  | { kind: 'mode'; mode: Exclude<FlagMode, 'default'>; userIds: string[] }
  | { kind: 'number'; number: number }
export function draftToRequest(draft: FlagDraft): FlagRequest {
  if (draft.kind === 'number') return draft.isDefault ? { kind: 'delete' } : { kind: 'number', number: draft.number }
  return draft.mode === 'default' ? { kind: 'delete' } : { kind: 'mode', mode: draft.mode, userIds: draft.userIds }
}

/** Save: sends exactly the one request the draft calls for. The refusal message, or null on success. */
export async function applyDraft(key: string, draft: FlagDraft): Promise<string | null> {
  const req = draftToRequest(draft)
  if (req.kind === 'delete') return clearFlag(key)
  if (req.kind === 'number') return setFlagNumber(key, req.number)
  return setFlagMode(key, req.mode, req.userIds)
}

/** Set an on/off flag's mode ('users' needs at least one id). The refusal message, or null on success. */
export async function setFlagMode(key: string, mode: Exclude<FlagMode, 'default'>, userIds: string[] = []): Promise<string | null> {
  const res = await api.PUT('/api/admin/flags/{key}', { params: { path: { key } }, body: modeBody(mode, userIds) })
  return res.error ? res.error.error : null
}

/** Set a number flag's value. The refusal message (out of range), or null on success. */
export async function setFlagNumber(key: string, number: number): Promise<string | null> {
  const res = await api.PUT('/api/admin/flags/{key}', { params: { path: { key } }, body: { number } })
  return res.error ? res.error.error : null
}

/** Remove a flag's override, back to its default behaviour. The refusal message, or null on success. */
export async function clearFlag(key: string): Promise<string | null> {
  const res = await api.DELETE('/api/admin/flags/{key}', { params: { path: { key } } })
  return res.error ? res.error.error : null
}

// Features: a flag's key without its last dot segment ("gamemode.minigolf.enabled" ->
// "gamemode.minigolf"); the page filters and groups by them, built from the keys alone.

/** A flag's feature: its key minus the last segment; a key with no dot is its own feature. */
export function featureOf(key: string): string {
  const i = key.lastIndexOf('.')
  return i < 0 ? key : key.slice(0, i)
}

/** The flag's own name within its feature: the last segment ("enabled"). */
export function flagName(key: string): string {
  return key.slice(key.lastIndexOf('.') + 1)
}

/** The top-level feature: the key's first segment ("gamemode"). */
export function topFeature(key: string): string {
  return key.split('.')[0]
}

/** Compares dotted paths segment by segment, so a parent sorts right before its children
 *  ("gamemode" < "gamemode.hilo" < "gamemode-x", unlike a plain string compare). */
export function compareFeatures(a: string, b: string): number {
  const as = a.split('.')
  const bs = b.split('.')
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) return as[i] < bs[i] ? -1 : 1
  }
  return as.length - bs.length
}

/** Every feature of these keys plus all its parents, each once, parents before their children. */
export function featureTree(keys: readonly string[]): string[] {
  const all = new Set<string>()
  for (const key of keys) {
    const parts = featureOf(key).split('.')
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('.'))
  }
  return [...all].sort(compareFeatures)
}

/** How deep a feature sits in the tree (0 for a top-level one). */
export function featureDepth(feature: string): number {
  return feature.split('.').length - 1
}

/** Whether a flag belongs to a feature or one of its sub-features ("gamemode" takes
 *  "gamemode.minigolf.enabled"; "game" doesn't take "gamemode.*"). */
export function inFeature(key: string, feature: string): boolean {
  const own = featureOf(key)
  return own === feature || own.startsWith(`${feature}.`)
}

/** A feature's colour: picked from the chart palette by its top-level feature, so every flag of
 *  "gamemode.*" shares one. Light colours, all at least 6.5:1 on the dark surfaces. */
export function featureColor(feature: string): string {
  let h = 0
  for (const c of topFeature(feature)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
