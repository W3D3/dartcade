// Plain .ts, not DataTable.svelte's <script module>: a named export from a .svelte file isn't
// visible to plain tsc (only svelte-check sees it), and tsc --noEmit runs first in `typecheck`.

/** A keyboard-activated row: Enter or Space (matching a native button/link), via `activate`
 *  rather than reading `event.key` inline, so this is unit-testable without a DOM. Returns
 *  whether it activated (so the caller knows whether to preventDefault, e.g. Space scrolling). */
export function activateRowOnKey(key: string, activate: (() => void) | undefined): boolean {
  if (!activate || (key !== 'Enter' && key !== ' ')) return false
  activate()
  return true
}
