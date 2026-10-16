// The "Get Autodarts voices" bookmarklet: autodartsVoices.js's text (?raw: the build leaves it as
// written) as one expression, for the console, and as a javascript: URL, for the bookmarks bar.
import source from './autodartsVoices.js?raw'

/** The code to paste into the browser console on play.autodarts.com. */
export const consoleSnippet = `(${source.replace(/^export default /m, '')})()`
/** The same code as a bookmark's URL. */
export const bookmarkletHref = `javascript:${encodeURIComponent(consoleSnippet)}`
