// List state (a filter, a tab) kept in the query part of the hash route, "#/history?mode=x01", so
// Back, reload and a shared link keep it. svelte-spa-router hands the part after "?" out as the
// `querystring` store; `location.search` is the wrong place (see AGENTS.md).

import { replace } from 'svelte-spa-router'
import { hrefs } from '$lib/routes'

/** The value under `key` when it is one of `allowed`; anything else (missing, unknown) is `fallback`. */
export function readParam<T extends string, F>(qs: string | null | undefined, key: string, allowed: readonly T[], fallback: F): T | F {
  const v = new URLSearchParams(qs ?? '').get(key)
  return allowed.find(a => a === v) ?? fallback
}

/** `path` with `key` set to `value`; a null value (the default) leaves it out. Other params stay. */
export function paramUrl(path: string, qs: string | null | undefined, key: string, value: string | null): string {
  const p = new URLSearchParams(qs ?? '')
  if (value === null) p.delete(key)
  else p.set(key, value)
  const q = p.toString()
  return q ? `${path}?${q}` : path
}

/**
 * Sets (or, for null, clears) a param on the current page. Replaces the history entry rather than
 * pushing one, so Back leaves the page instead of stepping through every filter change.
 */
export function setParam(path: string, qs: string | null | undefined, key: string, value: string | null): void {
  const url = paramUrl(path, qs, key, value)
  if (url !== paramUrl(path, qs, '', null)) void replace(url) // an unchanged URL needs no history write
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const HISTORY_KEY = 'dartcade:history-url'
const HISTORY_HREF = hrefs.history()

/** Remembers the History list's URL, filter included, for this tab, so a details page can link back to it. */
export function rememberHistoryUrl(storage: Store | null, qs: string | null | undefined): void {
  try {
    storage?.setItem(HISTORY_KEY, '#' + paramUrl('/history', qs, '', null))
  } catch {
    /* not remembered: the way back is the plain list */
  }
}

/** Where a details page leads back to: the remembered History URL, else the plain list. */
export function historyHref(storage: Store | null): string {
  try {
    const v = storage?.getItem(HISTORY_KEY) ?? null
    return v !== null && (v === HISTORY_HREF || v.startsWith(HISTORY_HREF + '?')) ? v : HISTORY_HREF
  } catch {
    return HISTORY_HREF
  }
}
