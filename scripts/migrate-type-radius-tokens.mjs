#!/usr/bin/env node
// Moves arbitrary type sizes and radii in the SPA onto the canvas tokens in app.css `@theme`.
//
//   text-[13px] -> text-small   when the class string already sets what the token carries, so
//                               the element renders exactly as before. A token sets size, line height,
//                               weight and letter spacing; an explicit font-*, leading-* or tracking-*
//                               utility wins over the token (Tailwind reads them through --tw-font-weight,
//                               --tw-leading, --tw-tracking), so:
//                                 weight   must be explicit (font-normal|medium|semibold|bold) and equal the token's
//                                 tracking must be explicit and equal the token's, if the token has one
//                                 leading  must be explicit (any value; an equal one is dropped as redundant),
//                                          since an implicit line height would change to the token's
//                               The utilities that equal the token are dropped (the token carries them).
//   rounded-[10px] -> rounded-md  (also rounded-t-/b-/l-/r-/tl-... and variants), when the px equals a radius token.
//
// Left alone, and listed with --report: sizes with no token, variant-prefixed sizes (md:text-[13px]),
// sizes whose weight, tracking or line height is implicit or differs.
// Type sizes are only read in plain "…", '…' and `…` strings without {…} or ${…}, so a class built
// from an expression is never touched. Rerunnable: a second run changes nothing.
//   node scripts/migrate-type-radius-tokens.mjs [--area <name>] [--dry] [--report]
//   --area   only the files of that area (see AREAS); several --area flags add up; none = all files
//   --dry    print the counts, write nothing
//   --report print every kept size per file (for the PR table)
//   --skip   leave the files whose path under src/ contains this text (repeatable)
//   --loose  also take sizes whose line height (or a 400 weight) is implicit (inherited): the token then sets
//            it, which can change how the element renders (a line height of 1.4 for the inherited one).
//            Never forces a bolder weight or a tracking. Check the screens before keeping it.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const FRONTEND = new URL('../backend/frontend/', import.meta.url).pathname
const SRC = join(FRONTEND, 'src')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const report = args.includes('--report')
const loose = args.includes('--loose')
const skips = args.flatMap((a, i) => (args[i - 1] === '--skip' ? [a] : []))
const areaNames = args.flatMap((a, i) => (args[i - 1] === '--area' ? [a] : []))

// One area per commit. A file belongs to the first area whose pattern matches its path under src/.
export const AREAS = {
  auth: /^(routes\/(Login|Register|Verify|Forgot|Reset|Legal)|lib\/components\/(AuthPanel|AuthFooter|auth\/))/,
  settings: /^(routes\/Settings|lib\/components\/settings\/|lib\/settings\/)/,
  admin: /^(routes\/(Admin|MinigolfBench)|lib\/components\/admin\/|lib\/admin\/)/,
  home: /^(routes\/Home|lib\/components\/home\/|lib\/home\/)/,
  match:
    /^(routes\/(GameDisplay|BigScreen)|lib\/components\/(match|x01|atc|cricket|p121|hilo|minigolf|bigscreen|coach)\/|lib\/(gameViews|bigscreen|cricket|p121|hilo|minigolf|coach)\/)/,
  rest: /./,
}

const css = readFileSync(join(SRC, 'app.css'), 'utf8')
const num = s => Number.parseFloat(s)

// text tokens: name -> { px, lh, weight, tr }
const TEXT = {}
for (const [, name, prop, val] of css.matchAll(/--text-([a-z-]+?)(--line-height|--font-weight|--letter-spacing)?:\s*([^;]+);/g)) {
  const t = (TEXT[name] ??= {})
  if (!prop) t.px = num(val)
  else if (prop === '--line-height') t.lh = num(val)
  else if (prop === '--font-weight') t.weight = num(val)
  else t.tr = num(val)
}
const RADII = {}
for (const [, name, px] of css.matchAll(/--radius-([a-z]+):\s*(\d+)px;/g)) RADII[px] = name
export const textTokens = Object.keys(TEXT)
export const radiusTokens = Object.values(RADII)

const WEIGHTS = { 'font-normal': 400, 'font-medium': 500, 'font-semibold': 600, 'font-bold': 700 }
const LEADINGS = {
  'leading-none': 1,
  'leading-tight': 1.25,
  'leading-snug': 1.375,
  'leading-normal': 1.5,
  'leading-relaxed': 1.625,
  'leading-loose': 2,
}
const TRACKINGS = {
  'tracking-tighter': -0.05,
  'tracking-tight': -0.025,
  'tracking-normal': 0,
  'tracking-wide': 0.025,
  'tracking-wider': 0.05,
  'tracking-widest': 0.1,
}
for (const [n, v] of Object.entries(Object.fromEntries(css.matchAll(/--tracking-([a-z]+):\s*(-?[\d.]+)em;/g).map(m => [m[1], num(m[2])]))))
  TRACKINGS[`tracking-${n}`] = v

const weightOf = t => WEIGHTS[t]
const leadingOf = t => LEADINGS[t] ?? (/^leading-\[([\d.]+)\]$/.test(t) ? num(t.slice(9, -1)) : undefined)
const trackingOf = t => TRACKINGS[t] ?? (/^tracking-\[(-?[\d.]+)em\]$/.test(t) ? num(t.slice(10, -3)) : undefined)

const SIZE = /^text-\[([\d.]+)px\]$/
const CLASSLIKE = /^[!\w\-:/.%#@()&>*+~,]+$/

// Decides what to do with one segment's tokens. Returns { replace: Map(oldToken -> newToken), drop: Set }
// and pushes kept sizes into `kept`.
function plan(tokens, kept) {
  const replace = new Map()
  const drop = new Set()
  const unvariant = tokens.filter(t => !t.includes(':'))
  const weights = unvariant.map(t => [t, weightOf(t)]).filter(([, v]) => v !== undefined)
  const leads = unvariant.map(t => [t, leadingOf(t)]).filter(([, v]) => v !== undefined)
  const tracks = unvariant.map(t => [t, trackingOf(t)]).filter(([, v]) => v !== undefined)
  // Only one size, weight, leading and tracking per string can be reasoned about; more means a conflict to leave alone.
  const sizes = tokens.filter(t => SIZE.test(t))
  for (const tok of sizes) {
    const px = num(tok.match(SIZE)[1])
    if (tok.includes(':')) {
      kept.push([px, 'variant'])
      continue
    }
    const cands = Object.entries(TEXT).filter(([, t]) => t.px === px)
    if (!cands.length) {
      kept.push([px, 'no token'])
      continue
    }
    if (sizes.length > 1 || weights.length > 1 || leads.length > 1 || tracks.length > 1) {
      kept.push([px, 'ambiguous'])
      continue
    }
    const w = weights[0]
    const lead = leads[0]
    const tr = tracks[0]
    let best = null
    let why = 'weight not explicit'
    for (const [name, t] of cands) {
      if (!loose && !w) continue
      // Loose never forces a bolder weight or a tracking the element did not ask for
      if (!w && t.weight !== 400) continue
      if (w && w[1] !== t.weight) {
        why = 'weight differs'
        if (!loose) continue
      }
      if (t.tr !== undefined && !tr) {
        why = 'tracking implicit'
        continue
      }
      if (t.tr !== undefined && tr[1] !== t.tr) {
        why = 'tracking differs'
        if (!loose) continue
      }
      if (!lead) {
        why = 'line height implicit'
        if (!loose) continue
      }
      // Prefer the token that also matches the string's explicit weight, leading and tracking
      const score =
        (w && w[1] === t.weight ? 4 : 0) +
        (lead && lead[1] === t.lh ? 2 : 0) +
        (tr && tr[1] === t.tr ? 1 : 0) -
        (t.tr !== undefined && !tr ? 8 : 0)
      if (!best || score > best.score) best = { name, t, score }
    }
    if (!best) {
      kept.push([px, why])
      continue
    }
    replace.set(tok, `text-${best.name}`)
    if (w && w[1] === best.t.weight) drop.add(w[0])
    if (lead && lead[1] === best.t.lh) drop.add(lead[0])
    if (tr && tr[1] === best.t.tr) drop.add(tr[0])
  }
  return { replace, drop }
}

// A radius swaps token for token, so it is safe in any class text, even next to a {…} expression
const RADIUS = /(?<![\w[-])rounded(-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-\[(\d+)px\](?![\w\]-])/g

function rewrite(src, kept) {
  let n = { text: 0, radius: 0 }
  const out = src.replace(/"([^"{}$]*)"|'([^'{}$]*)'|`([^`{}$]*)`/g, (whole, a, b, c) => {
    const body = a ?? b ?? c
    if (!/text-\[|rounded(-\w+)?-\[/.test(body)) return whole
    const parts = body.split(/(\s+)/)
    const tokens = parts.filter((p, i) => i % 2 === 0 && p)
    if (!tokens.every(t => CLASSLIKE.test(t.replace(/\[[^\]]*\]/g, '')))) return whole
    const { replace, drop } = plan(tokens, kept)
    const next = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (i % 2 === 1) {
        next.push(p)
        continue
      }
      if (drop.has(p)) {
        next.pop() // the whitespace before it
        if (!next.length) i++ // first token: skip the whitespace after it instead
        continue
      }
      if (replace.has(p)) {
        n.text++
        next.push(replace.get(p))
        continue
      }
      next.push(p)
    }
    const q = whole[0]
    return q + next.join('') + q
  })
  const withRadii = out.replace(RADIUS, (whole, side, px) => {
    if (!RADII[px]) return whole
    n.radius++
    return `rounded${side ?? ''}-${RADII[px]}`
  })
  return { out: withRadii, n }
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(svelte|ts)$/.test(name) && !/\.(gen|d)\.ts$/.test(name) && !p.includes('/lib/api/')) yield p
  }
}

const areaOf = rel => Object.entries(AREAS).find(([, re]) => re.test(rel))[0]
const total = { text: 0, radius: 0, files: 0 }
const keptAll = {}
for (const p of files(SRC)) {
  const rel = relative(SRC, p)
  if (areaNames.length && !areaNames.includes(areaOf(rel))) continue
  if (skips.some(k => rel.includes(k))) continue
  const src = readFileSync(p, 'utf8')
  const kept = []
  const { out, n } = rewrite(src, kept)
  for (const [px, why] of kept) {
    const k = (keptAll[rel] ??= {})
    k[`${px}px ${why}`] = (k[`${px}px ${why}`] ?? 0) + 1
  }
  if (out === src) continue
  total.files++
  total.text += n.text
  total.radius += n.radius
  if (!dry) writeFileSync(p, out)
}
console.log(`${dry ? 'would change' : 'changed'} ${total.files} files: ${total.text} text sizes, ${total.radius} radii`)
if (report) {
  const byReason = {}
  for (const k of Object.values(keptAll)) for (const [r, c] of Object.entries(k)) byReason[r] = (byReason[r] ?? 0) + c
  for (const [r, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(String(c).padStart(5), r)
}
