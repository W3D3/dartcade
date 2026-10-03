// CI check: an existing database upgraded with this branch's migrations ends up with the same
// schema as a fresh one. Applies the base branch's migrations (BASE_MIGRATIONS_DIR) to one empty
// schema and then this branch's on top, applies this branch's alone to another, and compares the
// two. An edited, renamed or reordered migration that already ran on real databases shows up as
// a difference here. With SCHEMA_DIFF_OUT set, it also writes what this branch changes in the
// schema (base migrations alone vs this branch's) as Markdown, for a PR comment.
//
// Usage: CHECK_DATABASE_URL=postgres://… BASE_MIGRATIONS_DIR=/tmp/base [SCHEMA_DIFF_OUT=diff.md] tsx src/db/checkMigrations.ts
import { writeFileSync } from 'fs'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.js'
import { runMigrations } from './queries.js'

const url = process.env.CHECK_DATABASE_URL
const baseDir = process.env.BASE_MIGRATIONS_DIR
if (!url || !baseDir) {
  console.error('Set CHECK_DATABASE_URL and BASE_MIGRATIONS_DIR')
  process.exit(2)
}

function inSchema(schema: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` }) }),
  })
}

/** The parts of a schema that matter, with the schema's own name taken out. */
async function describe(db: Kysely<Database>, schema: string): Promise<string[]> {
  const columns = await sql<{ line: string }>`
    SELECT table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable
      || ' default=' || coalesce(column_default, '') AS line
    FROM information_schema.columns WHERE table_schema = ${schema}`.execute(db)
  const constraints = await sql<{ line: string }>`
    SELECT c.conrelid::regclass::text || ' ' || pg_get_constraintdef(c.oid) AS line
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = ${schema}`.execute(db)
  const indexes = await sql<{ line: string }>`
    SELECT indexdef AS line FROM pg_indexes WHERE schemaname = ${schema}`.execute(db)
  return [...columns.rows, ...constraints.rows, ...indexes.rows]
    .map(r => r.line.replaceAll(`${schema}.`, ''))
    .sort()
}

const upgraded = 'migcheck_upgraded'
const fresh = 'migcheck_fresh'
const base = 'migcheck_base'
const schemas = [upgraded, fresh, base]

/** The schema change as Markdown: a diff block, or a note that nothing changed. */
function changeReport(before: string[], after: string[]): string {
  const removed = before.filter(l => !after.includes(l)).map(l => `- ${l}`)
  const added = after.filter(l => !before.includes(l)).map(l => `+ ${l}`)
  const marker = '<!-- schema-diff -->'
  if (!removed.length && !added.length) return `${marker}\n**Database schema:** no changes in this PR.\n`
  return [marker, `**Database schema changes in this PR** (${added.length} added, ${removed.length} removed lines)`, '',
    '```diff', ...removed, ...added, '```', ''].join('\n')
}

const admin = inSchema('public')
try {
  for (const s of schemas) {
    await sql.raw(`DROP SCHEMA IF EXISTS ${s} CASCADE; CREATE SCHEMA ${s}`).execute(admin)
  }
  const up = inSchema(upgraded)
  await runMigrations(up, { dir: baseDir })
  await runMigrations(up)
  const fr = inSchema(fresh)
  await runMigrations(fr)

  const bs = inSchema(base)
  await runMigrations(bs, { dir: baseDir })

  const a = await describe(up, upgraded)
  const b = await describe(fr, fresh)
  const before = await describe(bs, base)
  await Promise.all([up.destroy(), fr.destroy(), bs.destroy()])
  const out = process.env.SCHEMA_DIFF_OUT
  if (out) writeFileSync(out, changeReport(before, b))
  const onlyUpgraded = a.filter(l => !b.includes(l))
  const onlyFresh = b.filter(l => !a.includes(l))
  if (onlyUpgraded.length || onlyFresh.length) {
    console.error('::error::An upgraded database and a fresh one end up with different schemas.')
    for (const l of onlyUpgraded) console.error(`  only after upgrading: ${l}`)
    for (const l of onlyFresh) console.error(`  only when fresh:      ${l}`)
    process.exitCode = 1
  } else {
    console.log(`Migrations consistent: ${a.length} schema lines match after upgrading and fresh.`)
  }
} finally {
  for (const s of schemas) await sql.raw(`DROP SCHEMA IF EXISTS ${s} CASCADE`).execute(admin)
  await admin.destroy()
}
