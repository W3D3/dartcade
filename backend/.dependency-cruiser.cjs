// Layering rules (issue #564). oxlint's no-restricted-imports matches the import
// specifier text, not the resolved file, so it cannot say "outside shared/" or
// "value imports only"; dependency-cruiser resolves every import and knows type-only ones.
//
// Each rule's `from.pathNot` lists the files that break it today. Every entry names the
// issue that removes it; the PR that lands the fix deletes the entry. Tests are exempt.

const TEST = '\\.test\\.ts$'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'shared-stays-self-contained',
      comment: 'src/shared is dependency-free: it is also compiled into the SPA ($shared).',
      severity: 'error',
      from: { path: '^src/shared/', pathNot: [TEST] },
      to: { path: '^src/', pathNot: '^src/shared/' },
    },
    {
      name: 'api-is-imported-only-by-the-entry-points',
      comment: 'The HTTP layer sits on top: domain code must not depend on src/api.',
      severity: 'error',
      from: {
        pathNot: [
          TEST,
          '^src/api/',
          '^src/(app|index)\\.ts$', // wiring: registers the routes
          // #549 (B1): ApiError / engineErrors move out of api/
          '^src/friends/errors\\.ts$',
          '^src/lobby/errors\\.ts$',
          '^src/lobby/service\\.ts$',
          '^src/matchmaking/service\\.ts$',
          '^src/users/account\\.ts$',
        ],
      },
      to: { path: '^src/api/' },
    },
    {
      name: 'db-takes-types-from-domain-folders',
      comment: 'Queries run no domain rules: callers compute values and pass them in. `import type` is fine.',
      severity: 'error',
      from: {
        path: '^src/db/',
        pathNot: [
          TEST,
          // #552 (B4): finishEvents, newBoardToken and normalizeName computed by the caller
          '^src/db/queries\\.ts$',
          // #552 (B4): rankUpEvent computed by the ranked recorder
          '^src/db/ranked\\.ts$',
          // #552 (B4): reachedPerks computed by the caller
          '^src/db/progression\\.ts$',
          // #552 (B4): LobbyAccess becomes a type-only import
          '^src/db/lobbies\\.ts$',
        ],
      },
      to: {
        path: '^src/(?!db/|shared/|util/|schema/)[^/]+/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'session-knows-no-game-but-the-registry',
      comment: 'The engine drives any GameModule: only games/index and the shared helpers (teams, configMeta).',
      severity: 'error',
      from: {
        path: '^src/session/',
        pathNot: TEST,
      },
      to: { path: '^src/games/', pathNot: '^src/games/(index|teams|configMeta)\\.ts$' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
}
