// The avatar finishes' art as one sprite, assembled at build time from finishes/<id>/{foreground,background}.svg:
// each file becomes `<symbol id="finish-fg-<id>">` / `finish-bg-<id>`, its ids prefixed with `<id>-<layer>-` so
// the files can keep short local ids (`bg`, `glow`) without clashing once they share one document.
const files = import.meta.glob<string>('./finishes/*/*.svg', { query: '?raw', import: 'default', eager: true })

function symbol(path: string, svg: string): string {
  const match = /^\.\/finishes\/([^/]+)\/(foreground|background)\.svg$/.exec(path)
  if (!match) throw new Error(`unexpected finish file ${path}`)
  const [, finish, name] = match
  const layer = name === 'foreground' ? 'fg' : 'bg'
  const prefix = `${finish}-${layer}-`
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
  const body = inner
    .replace(/(\sid=")/g, `$1${prefix}`)
    .replace(/(url\(['"]?#)/g, `$1${prefix}`)
    .replace(/(href="#)/g, `$1${prefix}`)
  return `<symbol id="finish-${layer}-${finish}" viewBox="0 0 120 120">${body}</symbol>`
}

/** One hidden svg holding every finish layer as a symbol, for `<use href="#finish-bg-<id>">`. */
export const finishSprite =
  '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" aria-hidden="true" focusable="false">' +
  Object.entries(files)
    .map(([path, svg]) => symbol(path, svg))
    .join('') +
  '</svg>'
