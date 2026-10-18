import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { fillPlaceholders, loadLegal, legalValues } from './load.js'

describe('fillPlaceholders', () => {
  it('fills known placeholders and reports the empty ones', () => {
    const r = fillPlaceholders('By {{operator.name}}, {{address}}. Mail {{contact.email}}.', {
      operatorName: 'Chris W.',
      contactEmail: 'hi@x.org',
    })
    expect(r.md).toBe('By Chris W., {{address}}. Mail hi@x.org.')
    expect(r.missing).toEqual(['address'])
  })
})

describe('loadLegal', () => {
  it('renders the bundled defaults to html', async () => {
    const docs = await loadLegal(
      undefined,
      legalValues({ LEGAL_OPERATOR_NAME: 'Chris W.', LEGAL_ADDRESS: 'Graz', LEGAL_CONTACT_EMAIL: 'hi@x.org', LEGAL_UPDATED: '2026-10-17' }),
    )
    expect(docs.terms.html).toContain('<h1')
    expect(docs.privacy.html).toContain('Chris W.')
    expect(docs.imprint.missing).toEqual([])
    expect(docs.terms.updated).toBe('2026-10-17')
  })

  it('takes a file from LEGAL_DIR over the default, the default for the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'legal-'))
    await writeFile(join(dir, 'terms.md'), '# Our own terms')
    const docs = await loadLegal(dir, {})
    expect(docs.terms.html).toContain('Our own terms')
    expect(docs.privacy.html).toContain('<h1')
  })

  it('never flags {{updated}} as missing for the bundled defaults, which no longer use it (shown once, by Legal.svelte)', async () => {
    // LEGAL_UPDATED is left unset: the other placeholders are filled so they don't also show up in `missing`
    const docs = await loadLegal(
      undefined,
      legalValues({ LEGAL_OPERATOR_NAME: 'Chris W.', LEGAL_ADDRESS: 'Graz', LEGAL_CONTACT_EMAIL: 'hi@x.org' }),
    )
    expect(docs.terms.missing).toEqual([])
    expect(docs.privacy.missing).toEqual([])
    expect(docs.imprint.missing).toEqual([])
  })

  it('still fills and flags {{updated}} for a custom LEGAL_DIR file that uses it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'legal-'))
    await writeFile(join(dir, 'terms.md'), '# Our own terms\n\nLast updated: {{updated}}\n')
    const unset = await loadLegal(dir, legalValues({}))
    expect(unset.terms.missing).toEqual(['updated'])
    const set = await loadLegal(dir, legalValues({ LEGAL_UPDATED: '2026-11-01' }))
    expect(set.terms.html).toContain('2026-11-01')
    expect(set.terms.missing).toEqual([])
  })
})
