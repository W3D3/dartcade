// A Copy button's text to the clipboard, and what its label should say: 'copied' (or 'failed' when the browser
// refuses) until `resetMs` later, or for good with 0. A refusal never throws.
export type CopyState = 'idle' | 'copied' | 'failed'

export function createCopy(resetMs = 2000) {
  let state = $state<CopyState>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    get state(): CopyState {
      return state
    },
    async copy(text: string): Promise<void> {
      clearTimeout(timer)
      try {
        await navigator.clipboard.writeText(text)
        state = 'copied'
      } catch {
        state = 'failed'
      }
      if (resetMs > 0) timer = setTimeout(() => (state = 'idle'), resetMs)
    },
  }
}
