#!/usr/bin/env node
// Prints a short Markdown bullet list of failed spec titles from a Playwright JSON reporter
// file, for the e2e-fail PR comment. Usage: node scripts/summarize-e2e-failures.mjs <path>

import { readFileSync } from 'fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: summarize-e2e-failures.mjs <playwright-json-report>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(path, 'utf8'))
const failed = []

function walk(suite, prefix) {
  for (const spec of suite.specs ?? []) {
    if (!spec.ok) failed.push(`${prefix}${spec.title}`)
  }
  for (const child of suite.suites ?? []) {
    walk(child, `${prefix}${child.title} › `)
  }
}
for (const suite of data.suites ?? []) walk(suite, '')

console.log(failed.length ? failed.map(t => `- ${t}`).join('\n') : '_(could not determine which tests failed — see the uploaded report)_')
