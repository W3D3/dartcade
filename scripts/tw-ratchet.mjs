// Tailwind ratchet: counts the arbitrary values and dead utilities we are removing and fails when
// a count rises above scripts/tw-ratchet.baseline.json. `--update` lowers the baseline (never
// raises it), `--list` prints every match.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const src = join(root, 'backend/frontend/src')
const baselineFile = join(root, 'scripts/tw-ratchet.baseline.json')

// A class starts after whitespace, a quote, a backtick or a variant colon, and ends before one of them or a decimal point (m-0.5 is another class).
const cls = body => new RegExp(`(?<![\\w\\[-])${body}(?![\\w-]|\\.\\d)`, 'g')

const rules = {
  'text-[Npx]': cls('text-\\[\\d+(?:\\.\\d+)?px\\]'),
  'm-0 (preflight already resets it)': cls('m-0'),
  'list-none (preflight already resets it)': cls('list-none'),
  'font-[inherit] (preflight already resets it)': cls('font-\\[inherit\\]'),
}

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (/\.(svelte|ts|js|css|html)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) yield p
  }
}

const counts = Object.fromEntries(Object.keys(rules).map(r => [r, 0]))
const list = process.argv.includes('--list')
for (const file of files(src)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [name, re] of Object.entries(rules)) {
      for (const m of line.matchAll(re)) {
        counts[name]++
        if (list) console.log(`${relative(root, file)}:${i + 1}: ${name}: ${m[0]}`)
      }
    }
  })
}

const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'))
const raised = Object.keys(rules).filter(r => counts[r] > (baseline[r] ?? 0))
const lowered = Object.keys(rules).filter(r => counts[r] < (baseline[r] ?? 0))

if (process.argv.includes('--update')) {
  if (raised.length) {
    console.error(`Refusing to raise the baseline: ${raised.join(', ')}`)
    process.exit(1)
  }
  writeFileSync(baselineFile, JSON.stringify(counts, null, 2) + '\n')
  console.log('tw-ratchet: baseline written')
} else if (raised.length) {
  for (const r of raised) console.error(`tw-ratchet: ${r} went from ${baseline[r] ?? 0} to ${counts[r]}`)
  console.error(
    'Use a theme token (see src/app.css @theme) or drop the dead utility. Find matches with: node scripts/tw-ratchet.mjs --list',
  )
  process.exit(1)
} else {
  console.log(
    `tw-ratchet: ok${lowered.length ? ` (${lowered.length} below baseline, run node scripts/tw-ratchet.mjs --update to lock it in)` : ''}`,
  )
}
