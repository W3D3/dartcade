import { readFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'

export const LEGAL_DOCS = ['terms', 'privacy', 'imprint'] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]

export type LegalValues = { operatorName?: string; address?: string; contactEmail?: string; updated?: string }

/** LegalValues from the env (LEGAL_OPERATOR_NAME, LEGAL_ADDRESS, LEGAL_CONTACT_EMAIL, LEGAL_UPDATED). */
export function legalValues(env: Record<string, string | undefined>): LegalValues {
  return {
    operatorName: env.LEGAL_OPERATOR_NAME,
    address: env.LEGAL_ADDRESS,
    contactEmail: env.LEGAL_CONTACT_EMAIL,
    updated: env.LEGAL_UPDATED,
  }
}

const PLACEHOLDERS: Record<string, keyof LegalValues> = {
  'operator.name': 'operatorName',
  address: 'address',
  'contact.email': 'contactEmail',
  updated: 'updated',
}

/** Fills {{operator.name}}, {{address}}, {{contact.email}}, {{updated}}; returns the text and the placeholders left unfilled. */
export function fillPlaceholders(md: string, v: LegalValues): { md: string; missing: string[] } {
  const missing = new Set<string>()
  const filled = md.replace(/\{\{(operator\.name|address|contact\.email|updated)\}\}/g, (whole, key: string) => {
    const value = v[PLACEHOLDERS[key]]
    if (!value) {
      missing.add(key)
      return whole
    }
    return value
  })
  return { md: filled, missing: [...missing] }
}

const defaultsDir = fileURLToPath(new URL('./defaults/', import.meta.url))

async function readDoc(dir: string | undefined, doc: LegalDoc): Promise<string> {
  if (dir) {
    try {
      return await readFile(join(dir, `${doc}.md`), 'utf8')
    } catch {
      /* falls back to the bundled default below */
    }
  }
  return readFile(join(defaultsDir, `${doc}.md`), 'utf8')
}

export type LegalDocResult = { html: string; updated: string | null; missing: string[] }

async function render(dir: string | undefined, v: LegalValues, doc: LegalDoc): Promise<LegalDocResult> {
  const raw = await readDoc(dir, doc)
  const { md, missing } = fillPlaceholders(raw, v)
  // shortcut: the html isn't sanitized because the texts come from the operator; sanitize if users ever supply them
  const html = marked.parse(md, { async: false })
  return { html, updated: v.updated ?? null, missing }
}

/** Loads, fills and renders the three legal texts (LEGAL_DIR overrides the bundled defaults file by file). */
export async function loadLegal(dir: string | undefined, v: LegalValues): Promise<Record<LegalDoc, LegalDocResult>> {
  const [terms, privacy, imprint] = await Promise.all(LEGAL_DOCS.map(doc => render(dir, v, doc)))
  return { terms, privacy, imprint }
}
