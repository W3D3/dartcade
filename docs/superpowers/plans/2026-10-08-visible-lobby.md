# Visible lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hiding a lobby with one account: show it everywhere, make new lobbies Private,
hide ready states while solo, rename the Play page's button to "Choose players" (plus New lobby),
add Rematch to the win screen, and close lobbies with one account after 6 idle hours.

**Architecture:** The backend changes only small things: a migration for the access default,
`launch` always passes the lobby name, a new `closeIdleLobbies` sweep on a 5-minute timer.
Everything else is in the frontend. Components stop branching on `solo` to hide things, a few
labels change, and Rematch goes through the lobby page (`/lobby?rematch=1`) so the existing
start / start-problem logic runs it.

**Tech Stack:** Fastify + Kysely + Postgres (backend, vitest), Svelte 5 + svelte-spa-router
(frontend, vitest with `svelte/server` render), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-08-visible-lobby-design.md`

## Global Constraints

- The schema value for Private stays `invite`; only labels change ("Private"; hint "Only people you invite or give the code to").
- Idle close: exactly one account (`isSolo`), no running game, last activity (newest `lobby_activity.at`, else `lobbies.created_at`) more than 6 hours ago; sweep every 5 minutes.
- Play page labels: no lobby or your own lobby → **Choose players**; someone else's lobby → **Open lobby**; **New lobby** only while you host, are the lobby's only account and no game runs.
- Win screen: host of a lobby game → **Rematch** (primary) + **Back to lobby**; anyone else in a lobby game → **Back to lobby**; outside a lobby → **Back to Play**.
- Ready states (ready chips, ready badges, "N of M ready") are hidden while the lobby is solo.
- Commits: conventional `type(scope): subject`, lower case, under 72 chars, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend DB tests need `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test`.

## Review Focus

- A friend joins a solo lobby between the idle query and the close → the lobby must stay open (re-check inside the queue). Test in Task 2.
- A lobby with a game running for over 6 hours without activity rows → must not close. Test in Task 2.
- Rematch pressed when the game was already ended by someone else (DELETE 404) → still goes on to the lobby and rematches. Covered by `backToLobbyAfterWin` ignoring the DELETE result (Task 7).
- `/lobby?rematch=1` reloaded or opened again after the game started → must not start a second game or re-mark ready. The param is dropped from the URL once handled (Task 7, `rematchStep` returns null while a game runs).
- A member (not host) opening `/lobby?rematch=1` → nothing happens. `rematchStep` returns null for non-hosts (Task 7).

---

### Task 1: New lobbies are Private

**Files:**

- Create: `backend/src/db/migrations/018_lobby_private_default.sql`
- Modify: `backend/src/lobby/service.test.ts` (the friend-join tests rely on the old default)
- Modify: `backend/frontend/src/lib/components/lobby/LobbyAccessPanel.svelte`
- Modify: `backend/frontend/src/lib/lobby/format.ts` (`accessHint`)
- Test: `backend/src/lobby/service.test.ts`, `backend/frontend/src/lib/__tests__/lobbyAccessPanel.test.ts`, `backend/frontend/src/lib/__tests__/lobbyFormat.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing backend test.** In `service.test.ts`, `describe('joining as a friend')`, change the first test so the default is `invite` and the friend join needs Friends access set explicitly:

```ts
    it('new lobbies are private; a friend of the host joins one open to friends without a code', async () => {
      await befriend('chris', 'lena')
      const { id } = await lobbies.create('chris')
      expect((await lobbies.view(id))?.access).toBe('invite')
      await expect(lobbies.join('lena', id)).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.update('chris', id, { access: 'friends' })
      expect(await lobbies.join('lena', id)).toMatchObject({ id })
      expect((await lobbies.view(id))?.people.map(p => p.name)).toEqual(['Christoph', 'Lena'])
    })
```

Run `cd backend && TEST_DATABASE_URL=… npx vitest run src/lobby/service.test.ts` and check the other tests in that describe (and anywhere `join(` is called without a code) for reliance on `friends`; add `await lobbies.update(host, id, { access: 'friends' })` where one does.

- [ ] **Step 2: Run, expect FAIL** (`access` is `friends`).

- [ ] **Step 3: Migration.**

```sql
-- New lobbies are private (invite only) unless the host opens them to friends; open lobbies keep
-- their setting. Design: docs/superpowers/specs/2026-10-08-visible-lobby-design.md
ALTER TABLE lobbies ALTER COLUMN access SET DEFAULT 'invite';
```

- [ ] **Step 4: Run the lobby service tests, expect PASS.**

- [ ] **Step 5: Frontend label and hint.** Update `lobbyAccessPanel.test.ts`:

```ts
  it('offers Friends and Private, with what the choice means', () => {
    const out = render(LobbyAccessPanel, { props: { access: 'invite', onchange: () => {} } }).body
    expect(out).toContain('Who can join')
    expect(out).toContain('Friends')
    expect(out).toContain('Private')
    expect(out).toContain('Only people you invite or give the code to.')
  })
```

Run `cd backend/frontend && npx vitest run src/lib/__tests__/lobbyAccessPanel.test.ts` → FAIL. Then in `LobbyAccessPanel.svelte` set `{ value: 'invite', label: 'Private' }` (and its header comment: "Friends … or Private"), and in `format.ts`:

```ts
    : 'Only people you invite or give the code to.'
```

Fix any `accessHint` expectation in `lobbyFormat.test.ts`. Run both tests → PASS.

- [ ] **Step 6: Commit** `feat(lobby): make new lobbies private by default`.

### Task 2: Close idle solo lobbies

**Files:**

- Modify: `backend/src/db/lobbies.ts` (add `idleSoloLobbyIds`)
- Modify: `backend/src/lobby/service.ts` (add `SOLO_IDLE_MS`, `closeIdleLobbies`)
- Modify: `backend/src/index.ts` (timer)
- Test: `backend/src/lobby/service.test.ts`

**Interfaces:**

- Produces: `idleSoloLobbyIds(db: Kysely<Database>, before: Date, onlyId?: string): Promise<string[]>`; `LobbyService.closeIdleLobbies(now?: Date): Promise<string[]>` (ids closed); `export const SOLO_IDLE_MS = 6 * 60 * 60 * 1000`.

- [ ] **Step 1: Failing tests** (new `describe('idle close')` in `service.test.ts`; `later` simulates the clock instead of editing timestamps):

```ts
  describe('idle close', () => {
    const later = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000)

    it('closes a solo lobby (guests count as solo) idle for 6 hours, not one idle for less', async () => {
      const { id } = await lobbies.create('chris')
      await lobbies.addGuest('chris', id, { name: 'Guest 1' })
      expect(await lobbies.closeIdleLobbies(later(5))).toEqual([])
      expect(await lobbies.view(id)).not.toBeNull()
      expect(await lobbies.closeIdleLobbies(later(7))).toEqual([id])
      expect(await lobbies.view(id)).toBeNull()
    })

    it('keeps a lobby with two accounts, and one whose game is running', async () => {
      const shared = await lobbies.create('chris')
      await lobbies.join('lena', shared.id, shared.code)
      const playing = await lobbies.create('max')
      await lobbies.update('max', playing.id, { nextGame: { gameId: 'x01', config: { startScore: 101 } } })
      await lobbies.start('max', playing.id, false)
      expect(await lobbies.closeIdleLobbies(later(7))).toEqual([])
      expect(await lobbies.view(shared.id)).not.toBeNull()
      expect(await lobbies.view(playing.id)).not.toBeNull()
    })

    it('re-checks inside the queue: a lobby someone joined meanwhile stays open', async () => {
      const { id, code } = await lobbies.create('chris')
      const sweep = lobbies.closeIdleLobbies(later(7))
      await lobbies.join('lena', id, code)
      await sweep
      expect(await lobbies.view(id)).not.toBeNull()
    })
  })
```

(The third test relies on the join being queued before the sweep's close task: `closeIdleLobbies` awaits the query first, so the join's `enqueue` lands first. If it proves flaky, call `join` before awaiting by starting it synchronously and assert the outcome either way: the lobby is open and has Lena.)

- [ ] **Step 2: Run, expect FAIL** (`closeIdleLobbies` is not a function).

- [ ] **Step 3: Query** in `db/lobbies.ts`, after `getOpenLobbyIdByCode`:

```ts
/**
 * Open lobbies with at most one account (guests and bots don't count) whose last activity — the
 * newest feed line, else when it opened — is before `before`. `onlyId` narrows it to one lobby
 * (the re-check inside its queue). Whether a game runs isn't known here: the caller checks.
 */
export async function idleSoloLobbyIds(db: Kysely<Database>, before: Date, onlyId?: string): Promise<string[]> {
  let query = db
    .selectFrom('lobbies as l')
    .select('l.id')
    .where('l.closed_at', 'is', null)
    .where(sql<boolean>`(SELECT count(*) FROM lobby_people p WHERE p.lobby_id = l.id AND p.user_id IS NOT NULL) <= 1`)
    .where(sql<boolean>`COALESCE((SELECT max(a.at) FROM lobby_activity a WHERE a.lobby_id = l.id), l.created_at) < ${before}`)
  if (onlyId !== undefined) query = query.where('l.id', '=', onlyId)
  return (await query.execute()).map(r => r.id)
}
```

- [ ] **Step 4: Service** in `service.ts`. Next to `CODE_ATTEMPTS`:

```ts
/** A lobby with one account closes after this long without activity (and no game running). */
export const SOLO_IDLE_MS = 6 * 60 * 60 * 1000
```

After `closeIfSoloAndIdle`:

```ts
  /**
   * The idle sweep (every few minutes, from index.ts): closes lobbies with one account, no game
   * running and no activity for SOLO_IDLE_MS, so last night's guests aren't waiting tomorrow.
   * Each close re-checks inside the lobby's queue: someone may have joined or started a game
   * since the query. Returns the ids it closed.
   */
  async closeIdleLobbies(now: Date = new Date()): Promise<string[]> {
    const before = new Date(now.getTime() - SOLO_IDLE_MS)
    const closed: string[] = []
    for (const id of await q.idleSoloLobbyIds(this.db, before)) {
      const done = await this.enqueue(id, async () => {
        if (this.deps.engine.getLobbySession(id)) return false
        if ((await q.idleSoloLobbyIds(this.db, before, id)).length === 0) return false
        const lobby = await q.loadLobby(this.db, id)
        if (!lobby || lobby.closedAt !== null) return false
        await this.closeNow(lobby)
        return true
      })
      if (done) closed.push(id)
    }
    return closed
  }
```

- [ ] **Step 5: Run the idle-close tests, expect PASS.** Then the whole backend suite.

- [ ] **Step 6: Timer** in `index.ts`, after `await lobbies.settleAll()`:

```ts
// Lobbies with one account close after hours without activity (lobby/service.ts, SOLO_IDLE_MS)
const idleSweep = setInterval(
  () => {
    lobbies.closeIdleLobbies().catch((err: unknown) => {
      warn('idle lobby sweep failed', { error: String(err) })
    })
  },
  5 * 60 * 1000,
)
idleSweep.unref()
```

and in the `onClose` hook add `clearInterval(idleSweep)` before `friends.close()` (update its comment: "no friends pushes, idle sweep, grace or debounce timers left running"). Run `npm run typecheck` in `backend/`.

- [ ] **Step 7: Commit** `feat(lobby): close lobbies with one account after 6 idle hours`.

### Task 3: Solo games carry the lobby name

**Files:**

- Modify: `backend/src/lobby/service.ts` (`launch`)
- Modify: `schema/lobby-ws-v1.json` (`solo` descriptions, both places), regenerate with `npm run gen:api` at the repo root
- Test: `backend/src/lobby/service.test.ts`

- [ ] **Step 1: Update the test** at "a solo lobby starts without being ready, and the game carries no lobby name":

```ts
    it('a solo lobby starts without being ready, and the game carries the lobby name', async () => {
      const solo = await lobbies.create('max')
      await lobbies.update('max', solo.id, { nextGame: { gameId: 'x01', config: { startScore: 101 } } })
      await lobbies.addGuest('max', solo.id, { name: 'Guest 1' })
      const { sessionId } = await lobbies.start('max', solo.id, false)
      expect(engine.getSession(sessionId)).toMatchObject({ lobbyId: solo.id, lobbyName: "Max's lobby" })
    })
```

- [ ] **Step 2: Run, expect FAIL** (`lobbyName: null`).
- [ ] **Step 3:** In `launch`, `lobbyName: lobby.name,` (drop the `rules.isSolo` ternary).
- [ ] **Step 4:** In `schema/lobby-ws-v1.json` set both `solo` descriptions to `"Only one account is in the lobby (guests and pending invites don't count). The screens give the invite panel more room and hide ready states."`; run `npm run gen:api` at the repo root.
- [ ] **Step 5: Run backend tests + typecheck, expect PASS.** Grep the frontend for code that relied on `lobbyName === null` meaning solo (`grep -rn "lobbyName" backend/frontend/src`); none should branch on it for solo, but check.
- [ ] **Step 6: Commit** `feat(lobby): show the lobby name on solo games too`.

### Task 4: The lobby indicator always shows your lobby

**Files:**

- Modify: `backend/frontend/src/lib/components/LobbyIndicator.svelte`, `LobbyStrip.svelte`
- Modify: `backend/frontend/src/lib/nav.ts` (`railLobby`)
- Test: `backend/frontend/src/lib/__tests__/nav.test.ts`

- [ ] **Step 1: Failing test.** In `nav.test.ts` replace "a solo lobby is a quiet way to invite friends":

```ts
  it('a solo lobby shows like any other: its name', () => {
    expect(railLobby({ ...s, solo: true }, true)).toMatchObject({ kind: 'in', href: '/lobby', label: s.name })
  })
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3:** In `nav.ts` drop the `summary.solo` line and the `'solo'` kind from `RailLobby` (`{ kind: 'in'; href: string; label: string; aria: string }`); fix `NavRail.svelte` if it branches on `kind === 'solo'`. In `LobbyIndicator.svelte`: `const view = $derived(summary ? indicatorView(summary) : null)`, delete the `{:else if summary?.solo}` "Play with friends" block and the `Users` import, and rewrite the header comment (no solo special case). In `LobbyStrip.svelte`: `const view = $derived($me?.lobby ? indicatorView($me.lobby) : null)` and its comment.
- [ ] **Step 4: Run frontend tests + `npm run typecheck` + `npm run lint` in `backend/frontend/`, expect PASS.**
- [ ] **Step 5: Commit** `feat(lobby): always show your lobby in the side nav and phone strip`.

### Task 5: The lobby page while solo

**Files:**

- Modify: `backend/frontend/src/routes/Lobby.svelte` (feed always)
- Modify: `backend/frontend/src/lib/components/lobby/LobbyHeader.svelte` (Close while solo)
- Modify: `backend/frontend/src/lib/components/lobby/InviteFriendsPanel.svelte` (comment)
- Modify: `backend/frontend/src/lib/components/lobby/PersonStatus.svelte`, `PersonControls.svelte`, `PeopleList.svelte`, `ReadyCount.svelte`, `NextGameCard.svelte`
- Test: `backend/frontend/src/lib/__tests__/lobbyReadySolo.test.ts` (new)

**Interfaces:**

- Produces: `PersonStatus` prop `showReady: boolean` (default `true`); `ReadyCount` renders "**N** playing · suffix" while `lobby.solo`.

- [ ] **Step 1: Failing test** `lobbyReadySolo.test.ts` (copy the `bits-ui` mock and a lobby fixture from `lobbyPeopleAddBot.test.ts`; render with `svelte/server`):

```ts
import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import ReadyCount from '../components/lobby/ReadyCount.svelte'
import PersonStatus from '../components/lobby/PersonStatus.svelte'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

vi.mock('bits-ui', () => ({ Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} } }))

const person = (patch: Partial<LobbyPerson>): LobbyPerson => ({ /* copy the person factory from lobbyPeopleAddBot.test.ts */ ...patch }) as LobbyPerson
const lobbyOf = (solo: boolean): Lobby => ({ /* copy the lobby fixture */ solo, people: [person({ id: 'p1', plays: true, ready: false })] }) as Lobby

describe('ready states while solo', () => {
  it('ReadyCount: "N playing" while solo, "N of M ready" once shared', () => {
    expect(render(ReadyCount, { props: { lobby: lobbyOf(true), suffix: 'list order' } }).body).toContain('playing')
    expect(render(ReadyCount, { props: { lobby: lobbyOf(true), suffix: 'list order' } }).body).not.toContain('ready')
    expect(render(ReadyCount, { props: { lobby: lobbyOf(false), suffix: 'list order' } }).body).toContain('ready')
  })

  it('PersonStatus: no ready badge without showReady; sitting out still shows', () => {
    expect(render(PersonStatus, { props: { person: person({ plays: true, ready: false }), showReady: false } }).body).not.toContain('ready')
    expect(render(PersonStatus, { props: { person: person({ plays: false }), showReady: false } }).body).toContain('Sits out')
    expect(render(PersonStatus, { props: { person: person({ plays: true, ready: true }) } }).body).toContain('Ready')
  })
})
```

(Fill the two fixtures with real fields from `lobbyPeopleAddBot.test.ts`; no placeholders in the committed file. Check `PersonStatus`'s sits-out label and match it.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Components.**
  - `PersonStatus.svelte`: add `showReady = true` prop; the ready / not-ready badges render only when `showReady`.
  - `PersonControls.svelte`: `const showReady = $derived(!lobby.solo)`; the Ready `ToggleChip` and the `PersonStatus` fallback get `{#if showReady}` / `showReady={showReady}`.
  - `PeopleList.svelte`: default controls `<PersonStatus person={p} showReady={!lobby.solo} />`.
  - `ReadyCount.svelte`: while `lobby.solo` render `<strong class="text-text">{c.playing}</strong> <span class="text-text-muted">playing · {suffix}</span>`.
  - `NextGameCard.svelte`: wrap the "you can start anyway" `ReadyCount` line in `{#if !lobby.solo}`.
- [ ] **Step 4: Header and feed.** In `LobbyHeader.svelte`, while solo show only Close for the host (no code card, which `InviteFriendsPanel` already shows, and no Leave):

```svelte
  {#if lobby.solo}
    {#if host}
      <Button variant="destructive" onclick={() => (confirm = 'close')} class="h-[46px] md:h-12 self-start lg:self-end"
        disabled={gameRunning} title={gameRunning ? 'End the game first' : undefined}>Close lobby</Button>
    {/if}
  {:else}
    …existing block…
  {/if}
```

Update its header comment. In `Lobby.svelte` render both `ActivityFeed`s without the `{#if !l.solo}` guards and update the "Solo: no history…" comment. Update `InviteFriendsPanel.svelte`'s comment (Close and the feed now show while solo).

- [ ] **Step 5: Run frontend tests, typecheck, lint, expect PASS.**
- [ ] **Step 6: Commit** `feat(lobby): show close and feed while solo, hide ready states`.

### Task 6: Play page — Choose players and New lobby

**Files:**

- Modify: `backend/frontend/src/lib/lobby/play.ts` (labels, `offersNewLobby`, `startFreshLobby`)
- Modify: `backend/frontend/src/routes/CreateSession.svelte`
- Modify: `e2e/fixtures/lobby.ts` (button name)
- Test: `backend/frontend/src/lib/__tests__/lobbyPlay.test.ts`

**Interfaces:**

- Produces: `playLabel(action: PlayAction): string`; `offersNewLobby(lobby: Pick<LobbySummary, 'youHost' | 'solo' | 'sessionId'> | null): boolean`; `startFreshLobby(lobbyId: string, game: NextGame): Promise<string | null>` (null = done, else the message).

- [ ] **Step 1: Failing tests** in `lobbyPlay.test.ts`:

```ts
describe('playLabel', () => {
  it('Choose players with or without a lobby of your own; Open lobby in someone else\'s', () => {
    expect(playLabel('create')).toBe('Choose players')
    expect(playLabel('continue')).toBe('Choose players')
    expect(playLabel('open')).toBe('Open lobby')
  })
})

describe('offersNewLobby', () => {
  it('only to the host of a solo lobby with no game running', () => {
    expect(offersNewLobby(null)).toBe(false)
    expect(offersNewLobby({ youHost: true, solo: true, sessionId: null })).toBe(true)
    expect(offersNewLobby({ youHost: true, solo: false, sessionId: null })).toBe(false)
    expect(offersNewLobby({ youHost: true, solo: true, sessionId: 's1' })).toBe(false)
    expect(offersNewLobby({ youHost: false, solo: true, sessionId: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: `play.ts`.** Update the file's header comment ("Choose players" saves the game as the lobby's next game and goes there). Add:

```ts
const LABELS: Record<PlayAction, string> = { create: 'Choose players', continue: 'Choose players', open: 'Open lobby' }

/** The main button's text: the next step (picking the people) unless it's someone else's lobby. */
export function playLabel(action: PlayAction): string {
  return LABELS[action]
}

/** "New lobby" under the main button: only for the host of a solo lobby with no game running (nobody gets left behind). */
export function offersNewLobby(lobby: Pick<LobbySummary, 'youHost' | 'solo' | 'sessionId'> | null): boolean {
  return lobby !== null && lobby.youHost && lobby.solo && lobby.sessionId === null
}

/** New lobby: closes yours (guests and bots go with it) and opens a fresh one with the game. Null when done, else the message. */
export async function startFreshLobby(lobbyId: string, game: NextGame): Promise<string | null> {
  const { error } = await api.POST('/api/lobbies/{id}/close', { params: { path: { id: lobbyId } } })
  if (error) return describeConflict(error)
  return saveNextGame(null, game)
}
```

- [ ] **Step 4: `CreateSession.svelte`.** Replace `LABELS[action]` with `playLabel(action)` (delete the local `LABELS`); add `const newLobby = $derived(offersNewLobby($me?.lobby ?? null))` and a `freshLobby()` handler mirroring `toLobby()` that calls `startFreshLobby($me!.lobby!.id, picked)` then `push(lobbyPath(boardFromLink))`. Under the `PlayButton`:

```svelte
          {#if newLobby && !loading}
            <Button variant="ghost" size="md" disabled={busy} onclick={() => void freshLobby()}>New lobby</Button>
          {/if}
```

Change the header subtitle to "Choose a mode and set it up, then choose who plays."

- [ ] **Step 5:** In `e2e/fixtures/lobby.ts` use `name: /Choose players/` and update its doc comment.
- [ ] **Step 6: Run frontend tests, typecheck, lint, expect PASS.**
- [ ] **Step 7: Commit** `feat(play): say choose players, and offer a new lobby while solo`.

### Task 7: Rematch from the win screen

**Files:**

- Modify: `backend/frontend/src/lib/endControl.ts` (`winActions`)
- Modify: `backend/frontend/src/lib/lobby/start.ts` (`rematchStep`)
- Modify: `backend/frontend/src/lib/components/WinScreen.svelte` (primary/secondary actions)
- Modify: `backend/frontend/src/routes/GameDisplay.svelte`, `backend/frontend/src/routes/Lobby.svelte`
- Modify: `docs/superpowers/specs/2026-10-08-visible-lobby-design.md` (Rematch goes through `/lobby?rematch=1`)
- Test: `backend/frontend/src/lib/__tests__/endControl.test.ts`, `backend/frontend/src/lib/__tests__/lobbyStart.test.ts` (or wherever `startOutcome` is tested; create it if none)

**Interfaces:**

- Produces: `type WinAction = 'rematch' | 'lobby' | 'play'`; `winActions(snapshot: Snapshot | null, userId: string | null): { primary: WinAction; secondary: WinAction | null }`; `rematchStep(lobby: Lobby, viewerId: string | null): 'start' | 'ready' | null`.

- [ ] **Step 1: Failing tests.** `endControl.test.ts`:

```ts
describe('winActions', () => {
  it('the host of a lobby game: Rematch, then Back to lobby', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), 'host')).toEqual({ primary: 'rematch', secondary: 'lobby' })
  })
  it('anyone else in a lobby game: Back to lobby', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), 'lena')).toEqual({ primary: 'lobby', secondary: null })
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: 'l1' }), null)).toEqual({ primary: 'lobby', secondary: null })
  })
  it('a game outside a lobby: Back to Play', () => {
    expect(winActions(snap({ ownerUserId: 'host', lobbyId: null }), 'host')).toEqual({ primary: 'play', secondary: null })
  })
})
```

`rematchStep` tests (lobby fixture as in Task 5; `host` = `hostUserId`):

```ts
describe('rematchStep', () => {
  it('the host of a solo lobby starts right away', () => {
    expect(rematchStep(lobby({ solo: true, hostUserId: 'chris' }), 'chris')).toBe('start')
  })
  it('the host of a shared lobby marks themselves ready', () => {
    expect(rematchStep(lobby({ solo: false, hostUserId: 'chris' }), 'chris')).toBe('ready')
  })
  it('nothing for a member, or while a game runs', () => {
    expect(rematchStep(lobby({ solo: false, hostUserId: 'chris' }), 'lena')).toBeNull()
    expect(rematchStep(lobby({ solo: true, hostUserId: 'chris', currentSessionId: 's1' }), 'chris')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Logic.** `endControl.ts`:

```ts
export type WinAction = 'rematch' | 'lobby' | 'play'

/**
 * The win screen's buttons: the host of a lobby game gets Rematch (the same game, people and
 * settings again — the lobby keeps them after a game) and Back to lobby; anyone else in a lobby
 * game Back to lobby; a game outside a lobby Back to Play.
 */
export function winActions(snapshot: Snapshot | null, userId: string | null): { primary: WinAction; secondary: WinAction | null } {
  if (afterGameRoute(snapshot) === '/') return { primary: 'play', secondary: null }
  if (userId !== null && userId === snapshot?.ownerUserId) return { primary: 'rematch', secondary: 'lobby' }
  return { primary: 'lobby', secondary: null }
}
```

`start.ts`:

```ts
/**
 * What the lobby page does for `?rematch=1` (Rematch on the win screen): the host of a solo lobby
 * starts the next game right away; the host of a shared one marks themselves ready, and the
 * others get ready as usual. Nothing for anyone else, or while a game runs (a reload after the
 * rematch started).
 */
export function rematchStep(lobby: Lobby, viewerId: string | null): 'start' | 'ready' | null {
  if (viewerId === null || lobby.hostUserId !== viewerId || lobby.currentSessionId !== null) return null
  return lobby.solo ? 'start' : 'ready'
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: WinScreen.** Replace `doneLabel`/`ondone` with:

```ts
    primary: { label: string; rematch: boolean; onclick: () => void }
    secondary?: { label: string; onclick: () => void } | null
```

The primary button keeps its styling, icon `RotateCcw` when `rematch` else `House`. The secondary renders before it as an outlined button with the History button's classes (no icon), only when given. History stays.

- [ ] **Step 6: GameDisplay.** Build the buttons from `winActions(snapshot, $currentUser?.id ?? null)`:

```ts
  const WIN_LABELS: Record<WinAction, string> = { rematch: 'Rematch', lobby: 'Back to lobby', play: 'Back to Play' }
  async function finishWin(next: WinAction) {
    if (!sessionId) return
    // Ends the game for everyone (the host); a 404 means someone ended it already, which is fine
    if (control === 'end') await api.DELETE('/api/sessions/{id}', { params: { path: { id: sessionId } } })
    void push(next === 'rematch' ? '/lobby?rematch=1' : next === 'lobby' ? '/lobby' : '/')
  }
```

and pass `primary={{ label: WIN_LABELS[actions.primary], rematch: actions.primary === 'rematch', onclick: () => void finishWin(actions.primary) }}`, `secondary={actions.secondary ? { label: WIN_LABELS[actions.secondary], onclick: () => void finishWin(actions.secondary!) } : null}`. Delete `backToLobbyAfterWin`.

- [ ] **Step 7: Lobby page.** Read `rematch` once, like `boardFromLink`, and act when the lobby and your row are known:

```ts
  // Rematch on the win screen (#/lobby?rematch=1): start again (solo) or get ready (shared). Plain,
  // not state: handled once, and dropped from the URL so a reload doesn't do it again.
  let rematch = new URLSearchParams($querystring ?? '').get('rematch') === '1'
  $effect(() => {
    if (!rematch || !lobby || !mine) return
    const step = rematchStep(lobby, viewerId)
    const meId = mine.id
    rematch = false
    void replace('/lobby')
    if (step === 'start') void start()
    else if (step === 'ready' && !mine.ready) void updatePerson(meId, { ready: true })
  })
```

(`start()` already opens the game on success and shows `StartProblemDialog` on a refusal.) If both `board` and `rematch` params could arrive together they can't: the win screen never adds `board`.

- [ ] **Step 8: Spec.** In the spec's "Win screen" section, replace steps 2–3 with: "2. Go to `/lobby?rematch=1`. The lobby page, once loaded, does the rest (`rematchStep`): solo host → Start as if pressed there (success opens the game; a refusal shows the start-problem dialog); shared host → marks themselves ready. The param is dropped from the URL once handled." and in Testing replace "the Rematch flow's branches (…)" with "`rematchStep` for solo host / shared host / member / game running".
- [ ] **Step 9: Run frontend tests, typecheck, lint, expect PASS.**
- [ ] **Step 10: Commit** `feat(match): rematch from the win screen` (spec change folded in).

### Task 8: End-to-end check and finish

**Files:**

- Modify: `e2e/tests/game-x01.spec.ts` (rematch), if the e2e stack runs locally

- [ ] **Step 1:** Add to the X01 e2e (after it reaches the win screen): click **Rematch**, `await page.waitForURL('**/#/session/**')` with a different session id than before. If the existing spec doesn't play to a win, skip this step and note it.
- [ ] **Step 2:** Run the e2e suite as `DEVELOPMENT.md` describes; if it can't run here, say so in the PR.
- [ ] **Step 3:** Format (`npm run format` at the repo root), full tests (`mise run test` with `TEST_DATABASE_URL` set), both typechecks and lints.
- [ ] **Step 4:** Fold any fixes into the commit they belong to (`git commit --fixup` + `git rebase -i --autosquash` is interactive, so use `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main`).
