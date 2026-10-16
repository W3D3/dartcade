// autodartsVoices.js ships no types: it must stay plain, import-free JS (the SPA turns its
// text into the bookmarklet), so it can't be a .ts file. This covers its one export.
declare const getAutodartsVoices: (load?: (url: string) => Promise<Record<string, unknown>>) => Promise<string[]>
export default getAutodartsVoices
