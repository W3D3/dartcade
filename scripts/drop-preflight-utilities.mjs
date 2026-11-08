#!/usr/bin/env node
// Removes Tailwind utilities that Tailwind's preflight already sets, from static class="..."
// attributes on native elements in the SPA's .svelte files:
//   m-0, p-0           when the class string sets no other margin / padding (any variant)
//   list-none          on ul / ol / menu, when no other list-style utility is present
//   font-[inherit]     on button / input / select / textarea
//   bg-transparent     on button / input / select / textarea, when no other base bg- utility is present
// A `{...}` expression inside the class string is left alone, but it vetoes a removal it could
// contradict (a margin, padding, bg- or list- utility, or `!`).
// Skipped: components (they may forward `class` to a
// primitive with its own margin), and a token whose property the file's <style> block also sets.
// Rerunnable: it only ever removes tokens, so a second run changes nothing.
//   node scripts/drop-preflight-utilities.mjs          rewrite the files
//   node scripts/drop-preflight-utilities.mjs --dry    only print the counts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../backend/frontend/src', import.meta.url).pathname
const dry = process.argv.includes('--dry')
const FORM = new Set(['button', 'input', 'select', 'textarea'])
const LISTS = new Set(['ul', 'ol', 'menu'])

const base = t => t.slice(t.lastIndexOf(':') + 1)
const hasOther = (tokens, re, self) => tokens.some(t => t !== self && re.test(base(t)))

function dropsFor(tag, tokens, dyn, style) {
  const drop = new Set()
  if (tokens.some(t => t.includes('!')) || dyn.includes('!')) return drop
  const dynHas = re => re.test(dyn)
  if (tokens.includes('m-0') && !hasOther(tokens, /^-?m[xytrblse]?-/, 'm-0') && !dynHas(/(^|[\s'"`:])-?m[xytrblse]?-/)) drop.add('m-0')
  if (/margin/.test(style)) drop.delete('m-0')
  if (tokens.includes('p-0') && !hasOther(tokens, /^p[xytrblse]?-/, 'p-0') && !dynHas(/(^|[\s'"`:])p[xytrblse]?-/)) drop.add('p-0')
  if (/padding/.test(style)) drop.delete('p-0')
  if (LISTS.has(tag) && tokens.includes('list-none') && !hasOther(tokens, /^list-/, 'list-none') && !dynHas(/list-/)) {
    drop.add('list-none')
  }
  if (FORM.has(tag)) {
    if (tokens.includes('font-[inherit]')) drop.add('font-[inherit]')
    const otherBg = tokens.some(t => t !== 'bg-transparent' && t === base(t) && /^bg-/.test(t))
    if (tokens.includes('bg-transparent') && !otherBg && !dynHas(/bg-/)) drop.add('bg-transparent')
  }
  if (/list-style/.test(style)) drop.delete('list-none')
  if (/font/.test(style)) drop.delete('font-[inherit]')
  if (/background/.test(style)) drop.delete('bg-transparent')
  return drop
}

const counts = {}
let files = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.svelte')) rewrite(p)
  }
}

// The end of the class attribute's value: the closing quote outside any {...} expression
function valueEnd(src, from) {
  let depth = 0
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '"' && depth === 0) return i
  }
  return -1
}

// Splits a class value into its static text and the {...} expressions in it
function split(value) {
  let text = ''
  let dyn = ''
  let depth = 0
  for (const c of value) {
    if (c === '{') depth++
    if (depth > 0) dyn += c
    else text += c
    if (c === '}') depth--
  }
  return { text, dyn }
}

function rewrite(path) {
  const src = readFileSync(path, 'utf8')
  const style = (src.match(/<style[\s>][^]*?<\/style>/g) ?? []).join('\n')
  const tag = /<([a-z][a-z0-9]*)(?=[\s>])(?![^<]*<[a-z])/gi
  let out = ''
  let last = 0
  let changed = false
  for (const m of src.matchAll(/\sclass="/g)) {
    const start = m.index + m[0].length
    if (start < last) continue
    const end = valueEnd(src, start)
    if (end < 0) continue
    let name
    for (const t of src.slice(Math.max(0, m.index - 4000), m.index + 1).matchAll(tag)) name = t[1]
    if (!name || name !== name.toLowerCase()) continue
    const value = src.slice(start, end)
    const { text, dyn } = split(value)
    const drop = dropsFor(name, text.split(/\s+/).filter(Boolean), dyn, style)
    if (!drop.size) continue
    for (const t of drop) counts[t] = (counts[t] ?? 0) + 1
    changed = true
    // remove each dropped token from the static text only, keeping the {...} parts as they were
    let depth = 0
    let rebuilt = ''
    let word = ''
    const flush = () => {
      if (word && !drop.has(word)) rebuilt += word
      word = ''
    }
    for (const c of value) {
      if (c === '{') depth++
      if (depth > 0) {
        flush()
        rebuilt += c
      } else if (/\s/.test(c)) {
        flush()
        rebuilt += c
      } else word += c
      if (c === '}') depth--
    }
    flush()
    rebuilt = rebuilt.replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '')
    out += src.slice(last, start) + rebuilt
    last = end
  }
  if (!changed) return
  files++
  if (!dry) writeFileSync(path, (out + src.slice(last)).replace(/\sclass=""/g, ''))
}

walk(ROOT)
console.log(`${dry ? 'would change' : 'changed'} ${files} files`, counts)
