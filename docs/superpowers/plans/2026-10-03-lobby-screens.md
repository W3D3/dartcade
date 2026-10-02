# Lobby Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lobbies usable in the app: the lobby screen for hosts and members on desktop and phone, joining by code or link, invites with a badge, the lobby indicator, and starting lobby games from the Play page.

**Architecture:**
- The backend (PR #64) already does everything.
  - The browser changes a lobby through REST (`schema/api-v1.yaml`, typed `api` client).
  - It hears about every change on two push sockets: `/ws/lobby?lobbyId=`, a full lobby snapshot after each change, and `/ws/me`, your invites and lobby summary.
- **Logic lives in tested `lib/lobby/*.ts` modules:** formatting, the rule checks that decide which controls to show, the socket stores and the REST helpers.
- **Svelte components only lay out markup,** following the canvas artboards.
- **One small backend change:** the summary on `/ws/me` says whether you're the host.

**Tech Stack:** Svelte 5 (runes) + Tailwind v4 SPA (`backend/frontend`), svelte-spa-router hash routes, openapi-fetch client, zod schemas generated from `schema/lobby-ws-v1.json`, vitest. Backend: Fastify + TypeScript (one task).

**Spec:** `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`. Read "Frontend", "Lobby lifecycle", "Update after the lobby designs" and "Decided while planning the lobby backend". Designs: the **Dartcade Platform Design** canvas (https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23).
- Lobby screens: `project/Lobby.dc.html`, `Lobby-Host-Phone`, `Lobby-Phone`, `Lobby-Join`, `Lobby-Indicator`, `Invites-Phone`.
- Play page: `project/Play.dc.html`, `Mobile-Play`.

Read them with the Artifact tool (`read_file`), not a web fetch.

## Global Constraints

- AGENTS.md:
  - no TypeScript casts in non-test code
  - generated files (`backend/src/schema/*`, `backend/frontend/src/lib/api/{zod,schema,lobby-ws,game-ws}.ts`) change only through `npm run gen:api` at the repo root
  - conventional commits with a subject under 72 characters
- Run npm through mise's Node 22 (`mise exec -- npm …`). npm 11 rewrites `package-lock.json` in a way CI rejects.
- svelte-check must stay at **0 errors and 0 warnings**, `npm run lint` clean (frontend and backend), `npm run lint:api` with no warnings. Run lint by its exit code: `npm run lint; echo $?`.
- Tests: logic goes in `backend/frontend/src/lib/**` with vitest tests in `src/lib/__tests__/`. The repo has no Svelte component tests; components stay thin.
- UI copy (spec, "Update after the lobby designs"): "manual entry", never "by hand". Codes show as `K7Q4-MD`.
- Board rule (spec, Decisions → Boards):
  - Menus only list *your own* boards, plus Manual.
  - Anyone can give a person on Manual one of their own boards.
  - Once a person has a board, only the person, or a guest's adder, changes it.
  - The board's owner can take it back to Manual.
- Ready: only for your own rows (you and your guests), even for the host. Who plays: your own rows, or anyone for the host. Order and removing others: the host. A member removes only their own guests.
- Desktop is `md` (768 px) and up; below that is the phone layout (`$lib/viewport` `isPhone`, Tailwind `md:`).
- **Components over markup** (the user's ask):
  - Pages and panels compose components. A pattern used twice is one component: pills, toggles, menus, cards, steppers and confirmations.
  - Restyle through the kit's variants (`ui/button`, `ui/badge`, built with tailwind-variants), not ad-hoc classes.
  - Task 7 builds the shared pieces, and later tasks use them instead of inline markup.

## Decisions made while planning

Each states what the spec or canvas says, what this plan does, and why.

1. **Tablet rail** (`Lobby-Indicator`): the app has no tablet layout, only phone below `md` and desktop above. Not built.
2. **Lobby closed or left:** instead of the canvas's toast, the lobby page says "The lobby was closed" or "You're no longer in the lobby", with Create, Join and Play. Elsewhere the indicator simply disappears. Only the lobby socket knows the lobby closed rather than that you left, and a page message can't be missed.
3. **Invite cards** (`Invites-Phone`) show the lobby name, who invited you and when. The API has no boards, people or next mode for an invite, so those lines are left out.
4. **Invites on desktop** (no artboard): the side nav gets an "Invites" link with a count while you have pending invites. The `#/invites` page works at both sizes.
5. **Only the host sets the next game.** The Play page inside a lobby:
   - **Host:** "Game on" saves the picked mode and settings as the lobby's next game and starts it.
   - **Members:** they see the lobby players card and "<host> starts the game".
6. **Inline settings on the lobby's next-game card:** X01 only (start score 301/501/701, check-out, first to), as in the canvas. Every mode can be changed through "Change game", which opens the Play page.
7. **Opening the game:** when a lobby game starts, everyone who has a seat in it and has the lobby page open goes to the game, whether as a member or as a guest's adder. Everyone else sees a "Game running · Watch" bar.
8. **Friends chips** (`Lobby`): out of scope (#54).
9. **Presence:** a small dot by each member's avatar, lime when online and grey when away, which the canvas doesn't show. Also "board offline" in the board chip's tooltip.
10. **Pending invitees** appear under the people list as "Invited · waiting for <name>", not as rows. They aren't people yet; spec decision 8 in "Decided while planning the lobby backend".
11. **QR code:** rendered with `uqr` (MIT, no dependencies, a few KB), pinned to an exact version.
12. **New code** (spec: "the host can regenerate it"; no canvas control): the host gets a small "New code" button next to the QR button. It asks first, because the old link and QR code stop working.
13. **Components over markup** (the user's ask): Task 7 builds the shared pieces before any screen. The Play page's two inline steppers move to the shared `Stepper` in Task 14.

## Review Focus

Inputs the spec implies but no task's tests cover, most likely to bite first:

1. **The lobby socket closes** because you left or were removed (4403) or the lobby closed (4404). The page must stop retrying and go to Play with a message, not reconnect forever. → Task 5 test "stops on 4403/4404".
2. **A stale lobby page after a start.** The game starts while your lobby page is open: you go to the game once, and coming back to the lobby (Back) doesn't bounce you to the game again. → Task 6 test `shouldOpenGame` "only on the change from no game to a game".
3. **Typing a code loosely** (`k7q4 md`, with a dash or a space) on the Join page fetches the preview and joins. A wrong code shows "No open lobby with that code". → Task 4 test `normalizeCode`, Task 12 verify step.
4. **Accepting an invite while in another lobby** asks to leave first (`409 in_lobby`), and leaving takes your guests along. → Task 4 test `describeConflict`, Task 13 verify step.
5. **"Name or @username"** with only spaces, with `@` alone, or with a name over 32 characters. Nothing is sent; you get a clear hint. → Task 4 test `parseAddInput`.

---

## File structure

| File | Responsibility |
|---|---|
| `schema/lobby-ws-v1.json`, `backend/src/lobby/view.ts` | `LobbySummary.youHost` (Task 1) |
| `backend/frontend/src/lib/lobby/format.ts` | Codes, join link, game names, next-game summary, feed lines, feed times |
| `backend/frontend/src/lib/lobby/rules.ts` | Which controls the viewer gets (mirrors `backend/src/lobby/rules.ts`), board menu choices, counts |
| `backend/frontend/src/lib/lobby/input.ts` | "Name or @username" parsing, code normalizing, conflict messages |
| `backend/frontend/src/lib/lobby/sockets.ts` | `parseLobbyMessage`, `parseMeMessage`, `createLobbyStore` (/ws/lobby), `meStore` (/ws/me, app-wide) |
| `backend/frontend/src/lib/lobby/start.ts` | Start and rematch with the soft ready gate; `shouldOpenGame` |
| `backend/frontend/src/lib/components/lobby/*.svelte` | Shared pieces (Task 7: Avatar, ToggleChip, MenuPanel, PopoverMenu, MenuItem, Panel, Field, ReadyCount, EmptyState, SwitchLobbyConfirm) and the screen parts built from them (header, people rows, board chip, next game, member panel, feed, cards) |
| `backend/frontend/src/lib/components/Stepper.svelte` | −/+ number stepper, shared with the Play page |
| `backend/frontend/src/lib/components/LobbyIndicator.svelte`, `LobbyStrip.svelte`, `NavBadge.svelte` | Side nav card, phone strip, the invite count |
| `backend/frontend/src/routes/Lobby.svelte`, `Join.svelte`, `Invites.svelte` | The pages (`#/lobby`, `#/join`, `#/join/:code`, `#/invites`) |
| `backend/frontend/src/routes/CreateSession.svelte` | Lobby players card; "Game on" starts the lobby game |
| `backend/frontend/src/App.svelte`, `lib/nav.ts`, `TabBar.svelte`, `SideNav.svelte`, `Layout.svelte` | Routes, invite badge, indicator placement |

---

### Task 1: Tell the lobby summary whether you're the host

The indicator says "In lobby · Host" (`Lobby-Indicator`), and the `/ws/me` summary has no such flag.

**Files:**
- Modify: `schema/lobby-ws-v1.json` (`LobbySummary`)
- Modify: `backend/src/lobby/view.ts` (`lobbySummary`)
- Test: `backend/src/lobby/view.test.ts`
- Regenerate: `npm run gen:api` (writes `backend/src/schema/lobby-ws.ts`, `lobby-ws-v1.deref.json`, `zod.ts` and the frontend copies)

**Interfaces:**
- Produces: `LobbySummary.youHost: boolean` (generated type in `backend/frontend/src/lib/api/lobby-ws.ts`, zod in `lib/api/zod.ts` `MeMessageSchema`).

- [ ] **Step 1: Write the failing test.** In `backend/src/lobby/view.test.ts`, in `describe('lobbySummary')`, change the first `toEqual` and add a line:

```ts
    expect(lobbySummary(lobby, 'chris', session)).toEqual({
      id: 'l1', name: "Christoph's lobby", peopleCount: 3, nextGame: { gameId: 'x01', config: { startScore: 501 } },
      sessionId, gameId: 'x01', youThrowNext: true, leg: 0, youHost: true,
    })
    expect(lobbySummary(lobby, 'max', session).youThrowNext).toBe(false)
    expect(lobbySummary(lobby, 'max', session).youHost).toBe(false)
```

- [ ] **Step 2: Run it.** `cd backend && npx vitest run src/lobby/view.test.ts`. Expected: FAIL, `youHost` missing from the received object.

- [ ] **Step 3: Implement.**
  - In `schema/lobby-ws-v1.json`, `LobbySummary`: add `"youHost"` to `required` (after `"leg"`) and add the property:

    ```json
            "youHost": { "type": "boolean", "description": "The viewer is the lobby's host." }
    ```

  - In `backend/src/lobby/view.ts` `lobbySummary`, add after `leg: …`:

    ```ts
        youHost: lobby.hostUserId === userId,
    ```

  - Then run `npm run gen:api` at the repo root.

- [ ] **Step 4: Verify.** `cd backend && npx vitest run src/lobby && npm run typecheck`. Expected: PASS (the summary passes `checkLobbyMessage` in the same test, so the schema change is checked too). `cd backend/frontend && npm run typecheck`: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add schema/lobby-ws-v1.json backend/src/lobby/view.ts backend/src/lobby/view.test.ts backend/src/schema backend/frontend/src/lib/api
git commit -m "feat(lobby): the lobby summary says whether you're the host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 2: Lobby text: codes, links, game summaries, the feed

**Files:**
- Create: `backend/frontend/src/lib/lobby/format.ts`
- Test: `backend/frontend/src/lib/__tests__/lobbyFormat.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function gameName(gameId: string): string
  export function formatCode(code: string): string            // 'K7Q4MD' → 'K7Q4-MD'
  export function joinLink(origin: string, code: string): string // `${origin}/#/join/${code}`
  export function nextGameSummary(game: NextGame | null): string
  export type Part = { text: string; bold?: boolean }
  export function activityLine(a: LobbyActivity, viewerId: string | null): Part[]
  export function feedTime(at: string): string                 // local HH:MM
  ```

- [ ] **Step 1: Write the failing tests** in `backend/frontend/src/lib/__tests__/lobbyFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { activityLine, feedTime, formatCode, gameName, joinLink, nextGameSummary, type Part } from '../lobby/format.js'
import type { LobbyActivity } from '../api/lobby-ws'

const text = (parts: Part[]) => parts.map(p => p.text).join('')
const bold = (parts: Part[]) => parts.filter(p => p.bold).map(p => p.text)
const act = (over: Partial<LobbyActivity>): LobbyActivity => ({
  id: '1', at: '2026-10-02T19:40:00.000Z', kind: 'joined', actorUserId: 'lena', actorName: 'Lena', data: { name: 'Lena' }, ...over,
})

describe('lobby text', () => {
  it('formats codes and links', () => {
    expect(formatCode('K7Q4MD')).toBe('K7Q4-MD')
    expect(formatCode('ABC')).toBe('ABC')
    expect(joinLink('http://glados:5173', 'K7Q4MD')).toBe('http://glados:5173/#/join/K7Q4MD')
  })

  it('names game modes, and passes unknown ones through', () => {
    expect(gameName('x01')).toBe('X01')
    expect(gameName('atc')).toBe('Around the Clock')
    expect(gameName('cricket')).toBe('cricket')
  })

  it('sums up the next game', () => {
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 501, outMode: 'double', firstTo: 2 } })).toBe('501 · Double out · First to 2 legs')
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 301, outMode: 'straight', firstTo: 1 } })).toBe('301 · Straight out · First to 1 leg')
    expect(nextGameSummary({ gameId: 'atc', config: { order: 'random', finishOn: 'bull' } })).toBe('Random order · finish on bull')
    expect(nextGameSummary({ gameId: 'x01', config: { startScore: 'lots' } })).toBe('')
    expect(nextGameSummary(null)).toBe('')
  })

  it('writes the feed from the viewer\'s side, names in bold', () => {
    const moved = act({ kind: 'board_moved', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Max', fromBoardName: null, toBoardName: 'Living room' } })
    expect(text(activityLine(moved, 'chris'))).toBe('You moved Max to Living room')
    expect(text(activityLine(moved, 'lena'))).toBe('Christoph moved Max to Living room')
    expect(bold(activityLine(moved, 'lena'))).toEqual(['Christoph', 'Max'])
    expect(text(activityLine({ ...moved, data: { name: 'Max', toBoardName: null } }, 'lena'))).toBe('Christoph moved Max to manual entry')
    expect(text(activityLine(act({}), 'lena'))).toBe('You joined')
    expect(text(activityLine(act({ kind: 'left' }), 'chris'))).toBe('Lena left')
    expect(text(activityLine(act({ kind: 'guest_added', data: { name: 'Pia' } }), 'chris'))).toBe('Lena added guest Pia')
    expect(text(activityLine(act({ kind: 'removed', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Max' } }), 'max'))).toBe('Christoph removed Max')
    expect(text(activityLine(act({ kind: 'host_changed' }), 'chris'))).toBe('Lena is the host now')
    expect(text(activityLine(act({ kind: 'host_changed' }), 'lena'))).toBe("You're the host now")
    expect(text(activityLine(act({ kind: 'opened', actorUserId: 'chris', actorName: 'Christoph', data: { name: 'Christoph' } }), 'chris'))).toBe('You opened the lobby')
  })

  it('writes game lines, with or without a winner or someone who aborted', () => {
    const played = act({ kind: 'game_played', actorUserId: null, actorName: null, data: { gameId: 'x01', winnerName: 'Lena', players: [
      { name: 'Lena', placement: 1, forfeited: false }, { name: 'Max', placement: 2, forfeited: false },
    ] } })
    expect(text(activityLine(played, 'chris'))).toBe('Played X01 · 2 players · Lena won')
    expect(text(activityLine({ ...played, data: { gameId: 'atc', winnerName: null, players: [] } }, 'chris'))).toBe('Played Around the Clock')
    expect(text(activityLine(act({ kind: 'game_aborted', actorUserId: 'chris', actorName: 'Christoph', data: { gameId: 'x01' } }), 'lena'))).toBe('Christoph aborted X01')
    expect(text(activityLine(act({ kind: 'game_aborted', actorUserId: null, actorName: null, data: { gameId: 'x01' } }), 'lena'))).toBe('X01 was aborted')
  })

  it('shows the time of day', () => {
    expect(feedTime(new Date(2026, 9, 2, 21, 6).toISOString())).toBe('21:06')
  })
})
```

- [ ] **Step 2: Run it.** `cd backend/frontend && npx vitest run src/lib/__tests__/lobbyFormat.test.ts`. Expected: FAIL, `../lobby/format.js` cannot be loaded.

- [ ] **Step 3: Implement** `backend/frontend/src/lib/lobby/format.ts`:

```ts
// Text for the lobby screens: the join code and link, game summaries, the lobby history.
import type { LobbyActivity, NextGame } from '../api/lobby-ws'

const GAME_NAMES: Record<string, string> = { x01: 'X01', atc: 'Around the Clock' }

/** The mode's name ("X01", "Around the Clock"); the id itself for a mode we don't know. */
export function gameName(gameId: string): string {
  return GAME_NAMES[gameId] ?? gameId
}

/** K7Q4MD → K7Q4-MD, the way people read it out. */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Opening it (or scanning its QR code) lands on the Join page with the code filled in. */
export function joinLink(origin: string, code: string): string {
  return `${origin}/#/join/${code}`
}

const OUT: Record<string, string> = { straight: 'Straight out', double: 'Double out', master: 'Master out' }
const ATC_ORDER: Record<string, string> = { asc: '1–20', desc: '20–1', random: 'Random order' }
const ATC_FINISH: Record<string, string> = { twenty: 'finish on 20', single_bull: 'finish on 25', bull: 'finish on bull' }
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** One line about the next game's settings: "501 · Double out · First to 2 legs". */
export function nextGameSummary(game: NextGame | null): string {
  if (!game) return ''
  const c = game.config
  if (game.gameId === 'x01') {
    const start = int(c.startScore)
    const legs = int(c.firstTo)
    if (start === null) return ''
    return [String(start), OUT[str(c.outMode)], legs === null ? undefined : `First to ${legs} ${legs === 1 ? 'leg' : 'legs'}`]
      .filter(Boolean).join(' · ')
  }
  if (game.gameId === 'atc') return [ATC_ORDER[str(c.order)], ATC_FINISH[str(c.finishOn)]].filter(Boolean).join(' · ')
  return ''
}

/** A piece of a history line; names are bold. */
export type Part = { text: string; bold?: boolean }

/** A lobby history line, from the viewer's side ("You moved Max to Living room"). */
export function activityLine(a: LobbyActivity, viewerId: string | null): Part[] {
  const you = a.actorUserId !== null && a.actorUserId === viewerId
  const actor: Part = you ? { text: 'You' } : { text: a.actorName ?? 'Someone', bold: true }
  const name: Part = { text: a.data.name ?? 'someone', bold: true }
  const game: Part = { text: gameName(a.data.gameId ?? ''), bold: true }
  const t = (text: string): Part => ({ text })
  switch (a.kind) {
    case 'opened': return [actor, t(' opened the lobby')]
    case 'joined': return you ? [t('You joined')] : [name, t(' joined')]
    case 'left': return you ? [t('You left')] : [name, t(' left')]
    case 'removed': return [actor, t(' removed '), name]
    case 'guest_added': return [actor, t(' added guest '), name]
    case 'board_moved': return [actor, t(' moved '), name, t(` to ${a.data.toBoardName ?? 'manual entry'}`)]
    case 'host_changed': return you ? [t("You're the host now")] : [name, t(' is the host now')]
    case 'game_aborted': return a.actorUserId === null ? [game, t(' was aborted')] : [actor, t(' aborted '), game]
    case 'game_played': {
      const parts: Part[] = [t('Played '), game]
      const n = a.data.players?.length ?? 0
      if (n > 0) parts.push(t(` · ${n} ${n === 1 ? 'player' : 'players'}`))
      if (a.data.winnerName) parts.push(t(' · '), { text: `${a.data.winnerName} won`, bold: true })
      return parts
    }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** When it happened, as the time of day here: "21:06". */
export function feedTime(at: string): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS (6 tests). Then `npm run typecheck` (0 errors, 0 warnings) and `npm run lint; echo $?` (0).

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/format.ts backend/frontend/src/lib/__tests__/lobbyFormat.test.ts
git commit -m "feat(frontend): lobby text: codes, links, game summaries, history lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 3: Which lobby controls the viewer gets

The server decides everything (`backend/src/lobby/rules.ts`). This module mirrors it so the screens only show controls the server would accept.

**Files:**
- Create: `backend/frontend/src/lib/lobby/rules.ts`
- Test: `backend/frontend/src/lib/__tests__/lobbyRules.test.ts`

**Interfaces:**
- Consumes: `Lobby`, `LobbyPerson` from `lib/api/lobby-ws` (generated).
- Produces:
  ```ts
  export type OwnBoard = { id: string; name: string }
  export const controllerOf: (p: LobbyPerson) => string
  export const isHost: (lobby: Lobby, viewerId: string | null) => boolean
  export const myRow: (lobby: Lobby, viewerId: string | null) => LobbyPerson | null
  export const isMine: (p: LobbyPerson, viewerId: string | null) => boolean        // you or your guest
  export const canSetReady: (p: LobbyPerson, viewerId: string | null) => boolean
  export const canSetPlays: (lobby: Lobby, p: LobbyPerson, viewerId: string | null) => boolean
  export const canMove: (lobby: Lobby, viewerId: string | null) => boolean
  export function canRemove(lobby: Lobby, p: LobbyPerson, viewerId: string | null): boolean
  export type BoardChoice = { boardId: string | null; label: string; detail: string; current: boolean }
  export function boardChoices(p: LobbyPerson, viewerId: string | null, own: OwnBoard[]): BoardChoice[]
  export function counts(lobby: Lobby): { people: number; playing: number; ready: number }
  export function boardSummary(lobby: Lobby): string          // "Living room, Lena's place" (boards of who plays)
  export function playsInGame(lobby: Lobby, viewerId: string | null): boolean  // you or a guest of yours plays
  ```

- [ ] **Step 1: Write the failing tests** in `backend/frontend/src/lib/__tests__/lobbyRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { boardChoices, boardSummary, canMove, canRemove, canSetPlays, canSetReady, counts, isHost, isMine, myRow, playsInGame } from '../lobby/rules.js'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  boardOnline: false, boardMovedBy: null, usualBoardName: null, plays: true, ready: false, presence: null, ...over,
})
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris', ready: true, presence: 'online' })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', presence: 'away' })
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', plays: false })
const pia = person({ id: 'g', name: 'Pia', addedByUserId: 'lena', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', ready: true })
const lobby: Lobby = {
  id: 'l1', name: 'Friday darts', code: 'K7Q4MD', hostUserId: 'chris', throwOrder: 'lobby', nextGame: null, canRematch: false,
  currentSessionId: null, createdAt: '2026-10-02T19:40:00.000Z', people: [chris, lena, max, pia], invites: [], activity: [],
}
const own = [{ id: 'living', name: 'Living room' }, { id: 'garage', name: 'Garage' }]

describe('lobby rules for the screens', () => {
  it('knows the host and your own rows', () => {
    expect(isHost(lobby, 'chris')).toBe(true)
    expect(isHost(lobby, 'lena')).toBe(false)
    expect(isHost(lobby, null)).toBe(false)
    expect(myRow(lobby, 'lena')?.id).toBe('l')
    expect(myRow(lobby, 'sam')).toBeNull()
    expect([chris, lena, max, pia].filter(p => isMine(p, 'lena')).map(p => p.id)).toEqual(['l', 'g'])
  })

  it('ready: only your own rows, not even the host for others', () => {
    expect(canSetReady(lena, 'lena')).toBe(true)
    expect(canSetReady(pia, 'lena')).toBe(true)
    expect(canSetReady(lena, 'chris')).toBe(false)
  })

  it('who plays: your own rows, or anyone for the host', () => {
    expect(canSetPlays(lobby, pia, 'lena')).toBe(true)
    expect(canSetPlays(lobby, max, 'chris')).toBe(true)
    expect(canSetPlays(lobby, max, 'lena')).toBe(false)
  })

  it('order is the host\'s; members remove only their own guests, nobody removes themselves', () => {
    expect(canMove(lobby, 'chris')).toBe(true)
    expect(canMove(lobby, 'lena')).toBe(false)
    expect(canRemove(lobby, max, 'chris')).toBe(true)
    expect(canRemove(lobby, chris, 'chris')).toBe(false)
    expect(canRemove(lobby, pia, 'lena')).toBe(true)
    expect(canRemove(lobby, max, 'lena')).toBe(false)
  })

  it('board menu: your own boards for someone on Manual', () => {
    const c = boardChoices(max, 'chris', own)
    expect(c.map(b => [b.boardId, b.label, b.current])).toEqual([['living', 'Living room', false], ['garage', 'Garage', false]])
  })

  it('board menu: once someone has a board, only they change it, and its owner takes it back', () => {
    // Lena on her own board: Chris can't move her
    expect(boardChoices(lena, 'chris', own)).toEqual([])
    // Lena herself: Manual and her own boards
    expect(boardChoices(lena, 'lena', [{ id: 'lenas', name: "Lena's place" }]).map(b => [b.boardId, b.current]))
      .toEqual([[null, false], ['lenas', true]])
    // Chris put Max on his board: as the owner he can take it back, not swap it
    const onChris = { ...max, boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris' }
    expect(boardChoices(onChris, 'chris', own).map(b => b.boardId)).toEqual([null])
    expect(boardChoices(onChris, 'chris', own)[0]).toMatchObject({ label: 'Manual entry', detail: 'Take Living room back' })
  })

  it('counts people, who plays and who is ready; names the boards in use', () => {
    expect(counts(lobby)).toEqual({ people: 4, playing: 3, ready: 2 })
    expect(boardSummary(lobby)).toBe("Living room, Lena's place")
    expect(boardSummary({ ...lobby, people: [{ ...max, plays: true }] })).toBe('Manual entry')
  })

  it('knows whether you play in the next game, yourself or through a guest', () => {
    expect(playsInGame(lobby, 'lena')).toBe(true)
    expect(playsInGame(lobby, 'max')).toBe(false)
    expect(playsInGame({ ...lobby, people: [chris, { ...lena, plays: false }, pia] }, 'lena')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it.** `cd backend/frontend && npx vitest run src/lib/__tests__/lobbyRules.test.ts`. Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement** `backend/frontend/src/lib/lobby/rules.ts`:

```ts
// Which lobby controls the viewer gets. The server decides (backend src/lobby/rules.ts);
// this mirrors it so the screens only offer what it would accept.
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

/** One of the viewer's own paired boards. */
export type OwnBoard = { id: string; name: string }

/** Who acts for a person: a member for themselves, a guest's adder for the guest. */
export const controllerOf = (p: LobbyPerson): string => p.userId ?? p.addedByUserId

export const isHost = (lobby: Lobby, viewerId: string | null): boolean =>
  viewerId !== null && lobby.hostUserId === viewerId

export const myRow = (lobby: Lobby, viewerId: string | null): LobbyPerson | null =>
  lobby.people.find(p => p.userId !== null && p.userId === viewerId) ?? null

/** You, or a guest you added. */
export const isMine = (p: LobbyPerson, viewerId: string | null): boolean =>
  viewerId !== null && controllerOf(p) === viewerId

/** Nobody sets someone else's ready, not even the host. */
export const canSetReady = (p: LobbyPerson, viewerId: string | null): boolean => isMine(p, viewerId)

/** "In" / "sits out": your own rows, or anyone's for the host. */
export const canSetPlays = (lobby: Lobby, p: LobbyPerson, viewerId: string | null): boolean =>
  isMine(p, viewerId) || isHost(lobby, viewerId)

export const canMove = (lobby: Lobby, viewerId: string | null): boolean => isHost(lobby, viewerId)

/** The host removes anyone else; a member removes their own guests. Leaving is separate. */
export function canRemove(lobby: Lobby, p: LobbyPerson, viewerId: string | null): boolean {
  if (viewerId === null || p.userId === viewerId) return false
  if (isHost(lobby, viewerId)) return true
  return p.userId === null && p.addedByUserId === viewerId
}

/** An entry in a person's board menu; boardId null is manual entry. */
export type BoardChoice = { boardId: string | null; label: string; detail: string; current: boolean }

/**
 * What the board chip offers the viewer for this person (spec, Decisions → Boards). Your own
 * boards for someone on manual entry; once they have a board only they (a guest's adder)
 * change it, and the board's owner can take it back. Empty: no menu.
 */
export function boardChoices(p: LobbyPerson, viewerId: string | null, own: OwnBoard[]): BoardChoice[] {
  if (viewerId === null) return []
  const controls = isMine(p, viewerId)
  const owner = p.boardId !== null && p.boardOwnerUserId === viewerId
  const choices: BoardChoice[] = []
  if (controls || owner) {
    choices.push({
      boardId: null, label: 'Manual entry',
      detail: controls ? 'Enter darts on the keypad' : `Take ${p.boardName ?? 'your board'} back`,
      current: p.boardId === null,
    })
  }
  if (controls || p.boardId === null) {
    for (const b of own) choices.push({ boardId: b.id, label: b.name, detail: 'Your board', current: p.boardId === b.id })
  }
  return choices
}

export function counts(lobby: Lobby): { people: number; playing: number; ready: number } {
  const playing = lobby.people.filter(p => p.plays)
  return { people: lobby.people.length, playing: playing.length, ready: playing.filter(p => p.ready).length }
}

/** The boards the next game's players use, in lobby order: "Living room, Lena's place". */
export function boardSummary(lobby: Lobby): string {
  const names: string[] = []
  for (const p of lobby.people) {
    const name = p.boardName ?? 'Manual entry'
    if (p.plays && !names.includes(name)) names.push(name)
  }
  return names.join(', ')
}

/** You play the next game, yourself or through a guest of yours. */
export const playsInGame = (lobby: Lobby, viewerId: string | null): boolean =>
  lobby.people.some(p => p.plays && isMine(p, viewerId))
```


- [ ] **Step 4: Run it.** Expected: PASS (7 tests). `npm run typecheck`: 0 errors and 0 warnings. `npm run lint; echo $?`: 0.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/rules.ts backend/frontend/src/lib/__tests__/lobbyRules.test.ts
git commit -m "feat(frontend): which lobby controls the viewer gets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 4: What people type: names, @usernames, codes; what the server's refusals mean

**Files:**
- Create: `backend/frontend/src/lib/lobby/input.ts`
- Test: `backend/frontend/src/lib/__tests__/lobbyInput.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const GUEST_NAME_MAX = 32
  export type AddInput = { kind: 'guest'; name: string } | { kind: 'invite'; query: string } | { kind: 'invalid'; hint: string }
  export function parseAddInput(raw: string): AddInput
  export function normalizeCode(raw: string): string   // same as backend src/lobby/code.ts
  export type Refusal = { error: string; code?: LobbyConflict['code']; notReady?: LobbyConflict['notReady']; offlineBoards?: LobbyConflict['offlineBoards']; sessionId?: string; lobbyId?: string }
  export function describeConflict(body: Refusal): string
  ```

- [ ] **Step 1: Write the failing tests** in `backend/frontend/src/lib/__tests__/lobbyInput.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { describeConflict, normalizeCode, parseAddInput } from '../lobby/input.js'

describe('the "name or @username" field', () => {
  it('a plain name adds a guest; @ invites an account', () => {
    expect(parseAddInput('  Pia ')).toEqual({ kind: 'guest', name: 'Pia' })
    expect(parseAddInput('@lena')).toEqual({ kind: 'invite', query: 'lena' })
    expect(parseAddInput('@ lena ')).toEqual({ kind: 'invite', query: 'lena' })
  })

  it('refuses empty input, a bare @ and over-long names with a hint', () => {
    expect(parseAddInput('   ')).toEqual({ kind: 'invalid', hint: 'Type a name, or @ and a username' })
    expect(parseAddInput('@')).toEqual({ kind: 'invalid', hint: 'Type a username after the @' })
    expect(parseAddInput('x'.repeat(33))).toEqual({ kind: 'invalid', hint: 'Names can be 32 characters at most' })
    expect(parseAddInput('x'.repeat(32))).toEqual({ kind: 'guest', name: 'x'.repeat(32) })
  })
})

describe('lobby codes as people type them', () => {
  it('ignores case, dashes and spaces', () => {
    expect(normalizeCode('k7q4-md')).toBe('K7Q4MD')
    expect(normalizeCode(' K7Q4 MD ')).toBe('K7Q4MD')
  })
})

describe('what a refusal means', () => {
  it('names who isn\'t ready and which boards are offline', () => {
    expect(describeConflict({ error: 'x', code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }, { personId: 'm', name: 'Max' }] }))
      .toBe('Not ready yet: Lena, Max')
    expect(describeConflict({ error: 'x', code: 'board_offline', offlineBoards: ["Lena's place"] })).toBe("Board offline: Lena's place")
  })

  it('explains the lobby states', () => {
    expect(describeConflict({ error: 'x', code: 'in_lobby' })).toBe("You're in another lobby. Leave it first.")
    expect(describeConflict({ error: 'x', code: 'game_running' })).toBe('A game is running in this lobby')
    expect(describeConflict({ error: 'x', code: 'already_member' })).toBe("They're already in the lobby")
    expect(describeConflict({ error: 'x', code: 'already_invited' })).toBe("They're already invited")
  })

  it('passes the server\'s own words through otherwise', () => {
    expect(describeConflict({ error: 'Lena already has a game running', code: 'active_session' })).toBe('Lena already has a game running')
    expect(describeConflict({ error: 'board busy', code: 'board_busy' })).toBe('board busy')
    expect(describeConflict({ error: 'lobby not found' })).toBe('lobby not found')
  })
})
```

- [ ] **Step 2: Run it.** `cd backend/frontend && npx vitest run src/lib/__tests__/lobbyInput.test.ts`. Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement** `backend/frontend/src/lib/lobby/input.ts`:

```ts
// What people type on the lobby screens, and what the server's refusals mean for them.
import type { components } from '../api/schema'

type LobbyConflict = components['schemas']['LobbyConflict']

/** The longest guest name the server takes (AddGuestRequest in schema/api-v1.yaml). */
export const GUEST_NAME_MAX = 32

export type AddInput = { kind: 'guest'; name: string } | { kind: 'invite'; query: string } | { kind: 'invalid'; hint: string }

/** "Name or @username": a plain name adds a guest at your board, @ invites an account. */
export function parseAddInput(raw: string): AddInput {
  const s = raw.trim()
  if (s === '') return { kind: 'invalid', hint: 'Type a name, or @ and a username' }
  if (s.startsWith('@')) {
    const query = s.slice(1).trim()
    return query ? { kind: 'invite', query } : { kind: 'invalid', hint: 'Type a username after the @' }
  }
  if (s.length > GUEST_NAME_MAX) return { kind: 'invalid', hint: `Names can be ${GUEST_NAME_MAX} characters at most` }
  return { kind: 'guest', name: s }
}

/** Case, dashes and spaces don't matter (the server does the same: backend src/lobby/code.ts). */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** An error body from the lobby API: a plain `{ error }`, or a 409 with its code. */
export type Refusal = Pick<LobbyConflict, 'error'> & Partial<Pick<LobbyConflict, 'code' | 'notReady' | 'offlineBoards' | 'sessionId' | 'lobbyId'>>

/** One line for the screen. */
export function describeConflict(body: Refusal): string {
  switch (body.code) {
    case 'not_ready': return `Not ready yet: ${(body.notReady ?? []).map(p => p.name).join(', ')}`
    case 'board_offline': return `Board offline: ${(body.offlineBoards ?? []).join(', ')}`
    case 'in_lobby': return "You're in another lobby. Leave it first."
    case 'game_running': return 'A game is running in this lobby'
    case 'already_member': return "They're already in the lobby"
    case 'already_invited': return "They're already invited"
    default: return body.error
  }
}
```

- [ ] **Step 4: Run it.** Expected: PASS (6 tests). `npm run typecheck` 0/0, `npm run lint; echo $?` 0.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/input.ts backend/frontend/src/lib/__tests__/lobbyInput.test.ts
git commit -m "feat(frontend): parse lobby input, explain lobby refusals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 5: The lobby sockets: /ws/lobby per page, /ws/me for the whole app

**Files:**
- Create: `backend/frontend/src/lib/lobby/sockets.ts`
- Test: `backend/frontend/src/lib/__tests__/lobbySockets.test.ts`

**Interfaces:**
- Consumes: `LobbyServerMessageSchema`, `MeMessageSchema` (`lib/api/zod.ts`, generated; `MeMessage.lobby.youHost` from Task 1), `WsCloseCode` (`lib/api/game-ws.ts`).
- Produces:
  ```ts
  export function parseLobbyMessage(m: unknown): LobbyServerMessage | null
  export function parseMeMessage(m: unknown): MeMessage | null
  export type LobbyEnd = 'left' | 'closed'
  export type OpenSocket = (url: string) => WebSocket
  export function createLobbyStore(lobbyId: string, open?: OpenSocket): {
    lobby: Readable<Lobby | null>; ended: Readable<LobbyEnd | null>; destroy(): void }
  export type MeState = { invites: PendingInvite[]; lobby: LobbySummary | null }
  export function createMeStore(open?: OpenSocket): Readable<MeState | null> & { start(): void; stop(): void }
  export const me: ReturnType<typeof createMeStore>   // the app's one /ws/me
  ```

- [ ] **Step 1: Write the failing tests** in `backend/frontend/src/lib/__tests__/lobbySockets.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createLobbyStore, createMeStore, parseLobbyMessage, parseMeMessage } from '../lobby/sockets.js'

// A stand-in for the browser's WebSocket: tests push messages and closes into it
class FakeSocket {
  static opened: FakeSocket[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(readonly url: string) { FakeSocket.opened.push(this) }
  close() { this.closed = true }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }) }
  drop(code: number) { this.onclose?.({ code }) }
}
const open = (url: string) => new FakeSocket(url) as unknown as WebSocket

const lobby = {
  id: 'l1', name: 'Friday darts', code: 'K7Q4MD', hostUserId: 'chris', throwOrder: 'lobby', nextGame: null, canRematch: false,
  currentSessionId: null, createdAt: '2026-10-02T19:40:00.000Z', people: [], invites: [], activity: [],
}
const meMsg = { type: 'me', invites: [], lobby: {
  id: 'l1', name: 'Friday darts', peopleCount: 2, nextGame: null, sessionId: null, gameId: null, youThrowNext: false, leg: null, youHost: true,
} }

beforeEach(() => { FakeSocket.opened = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('parsing', () => {
  it('takes lobby snapshots and the closed message; drops the rest quietly', () => {
    expect(parseLobbyMessage({ type: 'lobby', lobby })?.type).toBe('lobby')
    expect(parseLobbyMessage({ type: 'lobby_closed', lobbyId: 'l1' })).toEqual({ type: 'lobby_closed', lobbyId: 'l1' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseLobbyMessage({ type: 'hello' })).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    expect(parseLobbyMessage({ type: 'lobby', lobby: { id: 1 } })).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('takes the per-user message', () => {
    expect(parseMeMessage(meMsg)?.lobby?.youHost).toBe(true)
    expect(parseMeMessage({ type: 'me', invites: 'x' })).toBeNull()
  })
})

describe('createLobbyStore', () => {
  it('opens the lobby socket and keeps the latest snapshot', () => {
    const s = createLobbyStore('l1', open)
    expect(FakeSocket.opened[0].url).toBe('/ws/lobby?lobbyId=l1')
    FakeSocket.opened[0].receive({ type: 'lobby', lobby })
    expect(get(s.lobby)?.name).toBe('Friday darts')
    s.destroy()
  })

  it('reconnects after a dropped connection', () => {
    const s = createLobbyStore('l1', open)
    FakeSocket.opened[0].drop(1006)
    vi.advanceTimersByTime(600)
    expect(FakeSocket.opened).toHaveLength(2)
    s.destroy()
  })

  it('stops on 4403/4404: you left or were removed, or the lobby closed', () => {
    const a = createLobbyStore('l1', open)
    FakeSocket.opened[0].drop(4403)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
    expect(get(a.ended)).toBe('left')
    const b = createLobbyStore('l1', open)
    FakeSocket.opened[1].drop(4404)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(2)
    expect(get(b.ended)).toBe('closed')
  })

  it('a lobby_closed message ends it too, and stops the socket', () => {
    const s = createLobbyStore('l1', open)
    FakeSocket.opened[0].receive({ type: 'lobby_closed', lobbyId: 'l1' })
    expect(get(s.ended)).toBe('closed')
    expect(FakeSocket.opened[0].closed).toBe(true)
  })
})

describe('createMeStore', () => {
  it('starts on demand, keeps the latest message, stops for good', () => {
    const m = createMeStore(open)
    expect(FakeSocket.opened).toHaveLength(0)
    m.start()
    m.start()
    expect(FakeSocket.opened).toHaveLength(1)
    expect(FakeSocket.opened[0].url).toBe('/ws/me')
    FakeSocket.opened[0].receive(meMsg)
    expect(get(m)?.lobby?.name).toBe('Friday darts')
    m.stop()
    expect(get(m)).toBeNull()
    FakeSocket.opened[0].drop(1006)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })

  it('gives up when signed out (4401)', () => {
    const m = createMeStore(open)
    m.start()
    FakeSocket.opened[0].drop(4401)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.opened).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it.** `cd backend/frontend && npx vitest run src/lib/__tests__/lobbySockets.test.ts`. Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement** `backend/frontend/src/lib/lobby/sockets.ts`:

```ts
// The two lobby sockets. /ws/lobby?lobbyId= pushes the whole lobby after every change (the
// lobby page). /ws/me pushes your pending invites and a summary of your lobby (the
// indicator and the invite badge, everywhere). Both only push; changes go through REST.
import { writable, type Readable } from 'svelte/store'
import { WsCloseCode } from '../api/game-ws'
import { LobbyServerMessageSchema, MeMessageSchema } from '../api/zod'
import type { Lobby, LobbyServerMessage, LobbySummary, MeMessage, PendingInvite } from '../api/lobby-ws'

const isTyped = (m: unknown, ...types: string[]): boolean =>
  typeof m === 'object' && m !== null && 'type' in m && typeof m.type === 'string' && types.includes(m.type)

/** A lobby socket message parsed against schema/lobby-ws-v1.json, or null (warns for broken lobby messages). */
export function parseLobbyMessage(m: unknown): LobbyServerMessage | null {
  const r = LobbyServerMessageSchema.safeParse(m)
  if (r.success) return r.data
  if (isTyped(m, 'lobby', 'lobby_closed')) console.warn('Ignoring a lobby message that does not match the schema', r.error.issues)
  return null
}

export function parseMeMessage(m: unknown): MeMessage | null {
  const r = MeMessageSchema.safeParse(m)
  return r.success ? r.data : null
}

/** Why a lobby page's socket stopped for good: you're not in the lobby any more, or it closed. */
export type LobbyEnd = 'left' | 'closed'
export type OpenSocket = (url: string) => WebSocket
const openWs: OpenSocket = url => new WebSocket(url)

function readJson(e: MessageEvent): unknown {
  if (typeof e.data !== 'string') return null
  try { return JSON.parse(e.data) } catch { return null }
}

export function createLobbyStore(lobbyId: string, open: OpenSocket = openWs) {
  const lobby = writable<Lobby | null>(null)
  const ended = writable<LobbyEnd | null>(null)
  let ws: WebSocket | null = null
  let stopped = false
  let backoff = 500

  function stop(reason: LobbyEnd | null) {
    stopped = true
    if (reason) ended.set(reason)
    ws?.close()
  }

  function connect() {
    if (stopped) return
    ws = open(`/ws/lobby?lobbyId=${encodeURIComponent(lobbyId)}`)
    ws.onmessage = (e) => {
      const msg = parseLobbyMessage(readJson(e))
      if (msg?.type === 'lobby') { lobby.set(msg.lobby); backoff = 500 }
      else if (msg?.type === 'lobby_closed') stop('closed')
    }
    ws.onclose = (e) => {
      const code: string | undefined = WsCloseCode[e.code]
      if (code === 'Unauthorized') { stopped = true; window.location.hash = '#/login'; return }
      if (code === 'Forbidden') { stop('left'); return }
      if (code === 'NotFound') { stop('closed'); return }
      if (stopped) return
      setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }
    ws.onerror = () => ws?.close()
  }
  connect()

  return {
    lobby: { subscribe: lobby.subscribe } satisfies Readable<Lobby | null>,
    ended: { subscribe: ended.subscribe } satisfies Readable<LobbyEnd | null>,
    destroy: () => stop(null),
  }
}

export type MeState = { invites: PendingInvite[]; lobby: LobbySummary | null }

/** The signed-in user's /ws/me; started once signed in, stopped on sign-out. */
export function createMeStore(open: OpenSocket = openWs) {
  const state = writable<MeState | null>(null)
  let ws: WebSocket | null = null
  let running = false
  let backoff = 500

  function connect() {
    if (!running) return
    const socket = open('/ws/me')
    ws = socket
    socket.onmessage = (e) => {
      const msg = parseMeMessage(readJson(e))
      if (msg) { state.set({ invites: msg.invites, lobby: msg.lobby }); backoff = 500 }
    }
    socket.onclose = (e) => {
      if (ws !== socket || !running) return
      if (WsCloseCode[e.code] === 'Unauthorized') { running = false; return }
      setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }
    socket.onerror = () => socket.close()
  }

  return {
    subscribe: state.subscribe,
    start() {
      if (running) return
      running = true
      backoff = 500
      connect()
    },
    stop() {
      running = false
      ws?.close()
      ws = null
      state.set(null)
    },
  }
}

/** The app's one /ws/me (App.svelte starts and stops it with the signed-in user). */
export const me = createMeStore()
```

- [ ] **Step 4: Run it.** Expected: PASS (8 tests). `npm run typecheck` 0/0. `npm run lint; echo $?` 0.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/sockets.ts backend/frontend/src/lib/__tests__/lobbySockets.test.ts
git commit -m "feat(frontend): lobby and per-user sockets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 6: Starting a lobby game, and when to open it

**Files:**
- Create: `backend/frontend/src/lib/lobby/start.ts`
- Test: `backend/frontend/src/lib/__tests__/lobbyStart.test.ts`

**Interfaces:**
- Consumes: `describeConflict`, `Refusal` (Task 4); `api` (`$lib/api`).
- Produces:
  ```ts
  export type StartOutcome =
    | { kind: 'started'; sessionId: string }
    | { kind: 'confirm'; notReady: string[] }           // ask "start anyway?", then call again with force
    | { kind: 'error'; message: string; sessionId: string | null }
  export function startOutcome(data: { sessionId: string } | undefined, error: Refusal | undefined): StartOutcome
  export function startGame(lobbyId: string, opts?: { rematch?: boolean; force?: boolean }): Promise<StartOutcome>
  export function shouldOpenGame(prev: string | null | undefined, next: string | null, playing: boolean): boolean
  ```

- [ ] **Step 1: Write the failing tests** in `backend/frontend/src/lib/__tests__/lobbyStart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldOpenGame, startOutcome } from '../lobby/start.js'

describe('startOutcome', () => {
  it('started: the new game', () => {
    expect(startOutcome({ sessionId: 's1' }, undefined)).toEqual({ kind: 'started', sessionId: 's1' })
  })

  it('people who play aren\'t ready: ask before starting anyway', () => {
    expect(startOutcome(undefined, { error: 'x', code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }] }))
      .toEqual({ kind: 'confirm', notReady: ['Lena'] })
  })

  it('anything else is an error, with the game to go to if there is one', () => {
    expect(startOutcome(undefined, { error: 'x', code: 'board_offline', offlineBoards: ['Garage'] }))
      .toEqual({ kind: 'error', message: 'Board offline: Garage', sessionId: null })
    expect(startOutcome(undefined, { error: 'Lena already has a game running', code: 'active_session', sessionId: 's9' }))
      .toEqual({ kind: 'error', message: 'Lena already has a game running', sessionId: 's9' })
    expect(startOutcome(undefined, undefined)).toEqual({ kind: 'error', message: 'Could not start the game', sessionId: null })
  })
})

describe('shouldOpenGame', () => {
  it('only on the change from no game to a game, and only for someone who plays', () => {
    expect(shouldOpenGame(null, 's1', true)).toBe(true)
    expect(shouldOpenGame(null, 's1', false)).toBe(false)
    // The first snapshot after opening the page (or coming Back from the game): stay
    expect(shouldOpenGame(undefined, 's1', true)).toBe(false)
    expect(shouldOpenGame('s1', 's1', true)).toBe(false)
    expect(shouldOpenGame('s1', null, true)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it.** Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement** `backend/frontend/src/lib/lobby/start.ts`:

```ts
// Starting a lobby game (Start, Rematch, the Play page's "Game on") with the soft ready gate:
// people who aren't ready get named and the host can start anyway.
import { api } from '$lib/api'
import { describeConflict, type Refusal } from './input'

export type StartOutcome =
  | { kind: 'started'; sessionId: string }
  | { kind: 'confirm'; notReady: string[] }
  | { kind: 'error'; message: string; sessionId: string | null }

export function startOutcome(data: { sessionId: string } | undefined, error: Refusal | undefined): StartOutcome {
  if (data) return { kind: 'started', sessionId: data.sessionId }
  if (error?.code === 'not_ready') return { kind: 'confirm', notReady: (error.notReady ?? []).map(p => p.name) }
  return { kind: 'error', message: error ? describeConflict(error) : 'Could not start the game', sessionId: error?.sessionId ?? null }
}

export async function startGame(lobbyId: string, opts: { rematch?: boolean; force?: boolean } = {}): Promise<StartOutcome> {
  const req = { params: { path: { id: lobbyId } }, body: opts.force ? { force: true } : {} }
  const res = opts.rematch
    ? await api.POST('/api/lobbies/{id}/rematch', req)
    : await api.POST('/api/lobbies/{id}/start', req)
  return startOutcome(res.data, res.error)
}

/**
 * Go to the lobby's game: only when it just started (the previous snapshot had none) and
 * you play in it. `prev` is undefined before the first snapshot, so opening the lobby page
 * (or coming back from the game) never bounces you into it.
 */
export function shouldOpenGame(prev: string | null | undefined, next: string | null, playing: boolean): boolean {
  return prev === null && next !== null && playing
}
```


- [ ] **Step 4: Run it.** Expected: PASS (5 tests). `npm run typecheck` 0/0, `npm run lint; echo $?` 0.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/start.ts backend/frontend/src/lib/__tests__/lobbyStart.test.ts
git commit -m "feat(frontend): start lobby games with the soft ready gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---


### Task 7: Shared pieces for the lobby screens

The lobby screens repeat the same few patterns: avatars, status pills, toggles, popover menus, titled panels, empty states, a number stepper, and "leave your lobby to join this one?". Each gets one component here, plus kit variants for the pills and the smaller accent button. Later tasks compose them; none writes this markup inline.

**Files:**
- Modify: `backend/frontend/src/lib/components/ui/badge/badge-variants.ts` (variants `host`, `guest`, `ready`, `not-ready`, `sits-out`)
- Modify: `backend/frontend/src/lib/components/ui/button/button-variants.ts` (variant `accent`)
- Create in `backend/frontend/src/lib/components/lobby/`: `Avatar.svelte`, `ToggleChip.svelte`, `MenuPanel.svelte`, `PopoverMenu.svelte`, `MenuItem.svelte`, `Panel.svelte`, `Field.svelte`, `ReadyCount.svelte`, `EmptyState.svelte`, `SwitchLobbyConfirm.svelte`
- Create: `backend/frontend/src/lib/components/Stepper.svelte`. It's app-wide; Task 14 uses it in `CreateSession.svelte` too.

**Interfaces (produced, used by Tasks 8–14):**
```ts
// ui/badge: <Badge variant="host" | "guest" | "ready" | "not-ready" | "sits-out">…</Badge>
// ui/button: <Button variant="accent">…</Button>   (h-11, lime, bold; for actions inside pages)
Avatar        { name: string; guest?: boolean; presence?: 'online' | 'away' | null; size?: number }
ToggleChip    { on: boolean; onclick: () => void; label?: string; tone?: 'soft' | 'solid'; size?: 'sm' | 'md'; children: Snippet }
MenuPanel     { label: string; align?: 'left' | 'right' | 'stretch'; width?: number; children: Snippet }   // the floating box
PopoverMenu   { label: string; triggerLabel?: string; triggerClass?: string; align?: 'left' | 'right'; width?: number;
                trigger: Snippet<[boolean]>; children: Snippet<[() => void]> }   // children get `close`
MenuItem      { label: string; detail?: string; checked?: boolean; danger?: boolean; onclick: () => void }
Panel         { title: string; label?: string; flat?: boolean; note?: Snippet; children: Snippet }
Field         { label: string; children: Snippet }                 // a small label above a control
ReadyCount    { lobby: Lobby; suffix: string }                      // "3 of 4 ready · <suffix>"
EmptyState    { title: string; text: string; icon?: Snippet; actions?: Snippet }
Stepper       { value: number; min?: number; label: string; unit?: (n: number) => string; highlight?: boolean; onchange: (n: number) => void }
SwitchLobbyConfirm { from: string; to: string; onconfirm: () => void; oncancel: () => void }
```

- [ ] **Step 1: Kit variants.**
  - In `ui/badge/badge-variants.ts`, add inside `variant`, after `soon`:

```ts
			// Lobby people: name tags, and where someone stands for the next game
			host:        "h-[18px] px-[6px] rounded-full bg-accent text-accent-fg text-[10px] font-bold tracking-[0.06em] uppercase shrink-0",
			guest:       "h-[18px] px-[6px] rounded-full border border-line-strong text-ink-2 text-[10px] font-bold tracking-[0.06em] uppercase shrink-0",
			ready:       "h-8 px-[10px] rounded-full bg-[#2b3417] text-accent text-[12px] font-bold",
			"not-ready": "h-8 px-[10px] rounded-full bg-[#22251f] text-warn text-[12px]",
			"sits-out":  "h-8 px-[10px] rounded-full border border-dashed border-line-strong text-text-muted text-[12px] font-medium",
```

  - In `ui/button/button-variants.ts`, add after `primary`:

```ts
			accent:      "h-11 px-4 rounded-[10px] bg-accent text-accent-fg text-[15px] font-bold",
```

- [ ] **Step 2: The components.**

`lobby/Avatar.svelte`:

```svelte
<script lang="ts">
  // A person's round avatar: their initial, dashed for a guest, with a dot while a member has the lobby open.
  let { name, guest = false, presence = null, size = 36 }: {
    name: string; guest?: boolean; presence?: 'online' | 'away' | null; size?: number
  } = $props()
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<span aria-hidden="true" style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.42)}px"
  class="relative shrink-0 box-border rounded-full flex items-center justify-center font-bold
         {guest ? 'border-[1.5px] border-dashed border-ink-faint text-ink-2' : 'bg-line-chip text-text'}">
  {initial}
  {#if presence}
    <span class="absolute -right-px -bottom-px w-[10px] h-[10px] rounded-full border-2 border-surface-panel
                 {presence === 'online' ? 'bg-accent' : 'bg-text-dim'}"></span>
  {/if}
</span>
```

`lobby/ToggleChip.svelte`:

```svelte
<script lang="ts">
  // A round on/off button: "In" / "Sits out", "Ready" / "Ready?", a who-plays chip.
  import type { Snippet } from 'svelte'

  let { on, onclick, label, tone = 'soft', size = 'sm', children }: {
    on: boolean
    onclick: () => void
    /** Read by screen readers instead of the visible text. */
    label?: string
    /** soft: lime tint when on, dashed when off. solid: lime when on, lime outline when off (ready). */
    tone?: 'soft' | 'solid'
    /** md: the who-plays chips, with an avatar inside. */
    size?: 'sm' | 'md'
    children: Snippet
  } = $props()

  const look = $derived(tone === 'solid'
    ? on ? 'border-0 bg-accent text-accent-fg font-bold' : 'border-[1.5px] border-solid border-accent bg-transparent text-accent font-bold'
    : on ? 'border border-solid border-[#5c7323] bg-[#2b3417] text-text font-semibold' : 'border border-dashed border-line-strong bg-transparent text-text-muted')
</script>

<button type="button" aria-pressed={on} aria-label={label} {onclick}
  class="inline-flex items-center rounded-full cursor-pointer font-[inherit] {look}
         {size === 'md' ? 'h-10 gap-2 pl-[5px] pr-3 text-[14px]' : 'h-8 gap-1 px-[10px] text-[12px]'}">
  {@render children()}
</button>
```

`lobby/MenuPanel.svelte`:

```svelte
<script lang="ts">
  // The floating box of a menu or a suggestion list, below what opened it.
  import type { Snippet } from 'svelte'

  let { label, align = 'left', width, children }: {
    label: string
    /** stretch: as wide as what it's under (suggestions under a field). */
    align?: 'left' | 'right' | 'stretch'
    width?: number
    children: Snippet
  } = $props()
</script>

<div role="menu" aria-label={label} style={width ? `width: ${width}px` : undefined}
  class="absolute top-[calc(100%+6px)] z-[6] box-border p-[6px] rounded-[12px] bg-surface-inset border border-line-popover
         shadow-[0_18px_48px_rgba(0,0,0,0.55)] flex flex-col gap-[2px]
         {align === 'right' ? 'right-0' : align === 'stretch' ? 'left-0 right-0' : 'left-0'}">
  {@render children()}
</div>
```

`lobby/PopoverMenu.svelte`:

```svelte
<script lang="ts">
  // A button that opens a small menu below it; picking an item or clicking outside closes it.
  import type { Snippet } from 'svelte'
  import MenuPanel from './MenuPanel.svelte'

  let { label, triggerLabel, triggerClass = '', align = 'left', width = 250, trigger, children }: {
    /** The menu's accessible name. */
    label: string
    /** The trigger button's accessible name. */
    triggerLabel?: string
    triggerClass?: string
    align?: 'left' | 'right'
    width?: number
    /** The trigger's content; told whether the menu is open. */
    trigger: Snippet<[boolean]>
    /** The items; given `close` to call after a pick. */
    children: Snippet<[() => void]>
  } = $props()

  let open = $state(false)
  const close = () => { open = false }
</script>

<span class="relative inline-block min-w-0 max-w-full">
  <button type="button" onclick={() => open = !open} aria-haspopup="menu" aria-expanded={open} aria-label={triggerLabel}
    class="cursor-pointer font-[inherit] {triggerClass}">
    {@render trigger(open)}
  </button>
  {#if open}
    <div class="fixed inset-0 z-[5]" onclick={close} aria-hidden="true"></div>
    <MenuPanel {label} {align} {width}>{@render children(close)}</MenuPanel>
  {/if}
</span>
```

`lobby/MenuItem.svelte`:

```svelte
<script lang="ts">
  // An item in a PopoverMenu: an action, or a choice (with `checked`) like a board.
  import { Check } from '@lucide/svelte'

  let { label, detail, checked, danger = false, onclick }: {
    label: string
    detail?: string
    /** Set for a choice: whether it's the current one. */
    checked?: boolean
    danger?: boolean
    onclick: () => void
  } = $props()
</script>

<button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} {onclick}
  class="min-h-11 flex items-center gap-[10px] px-[10px] border-0 rounded-[8px] text-left cursor-pointer font-[inherit]
         {checked ? 'bg-[#2b3417]' : 'bg-transparent hover:bg-[#262a22]'} {danger ? 'text-live-text' : 'text-text'}">
  <span class="flex flex-col gap-px flex-grow">
    <span class="text-[14px] md:text-[15px] {detail ? 'font-semibold' : ''}">{label}</span>
    {#if detail}<span class="text-[12px] text-text-muted">{detail}</span>{/if}
  </span>
  {#if checked}<Check size={16} class="text-accent" />{/if}
</button>
```

`lobby/Panel.svelte`:

```svelte
<script lang="ts">
  // A titled card on the lobby screens: the title, a note on the right, the content.
  import type { Snippet } from 'svelte'

  let { title, label, flat = false, note, children }: {
    title: string
    /** Accessible name of the section (default: the title). */
    label?: string
    /** No card on phones (the people list sits on the page there). */
    flat?: boolean
    note?: Snippet
    children: Snippet
  } = $props()
</script>

<section aria-label={label ?? title}
  class="flex flex-col gap-[10px] md:gap-[14px] min-h-0 box-border
         {flat ? 'md:p-5 md:rounded-[14px] md:bg-surface-panel md:border md:border-line-2' : 'p-4 md:p-5 rounded-[14px] bg-surface-panel border border-line-2'}">
  <div class="flex justify-between items-baseline gap-3">
    <h2 class="m-0 text-[15px] md:text-[17px] font-semibold">{title}</h2>
    {#if note}<span class="text-[12px] md:text-[13px] text-text-muted text-right">{@render note()}</span>{/if}
  </div>
  {@render children()}
</section>
```

`lobby/Field.svelte`:

```svelte
<script lang="ts">
  // A small label above a control (start score, check-out, throw order).
  import type { Snippet } from 'svelte'

  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<div class="flex flex-col gap-[6px]">
  <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">{label}</span>
  {@render children()}
</div>
```

`lobby/ReadyCount.svelte`:

```svelte
<script lang="ts">
  // "3 of 4 ready · <suffix>": who plays the next game and how many of them are ready.
  import type { Lobby } from '$lib/api/lobby-ws'
  import { counts } from '$lib/lobby/rules'

  let { lobby, suffix }: { lobby: Lobby; suffix: string } = $props()
  const c = $derived(counts(lobby))
</script>

<strong class="text-text">{c.ready} of {c.playing}</strong> <span class="text-text-muted">ready · {suffix}</span>
```

`lobby/EmptyState.svelte`:

```svelte
<script lang="ts">
  // Nothing to show yet: an optional icon, a title, a line of help, and what to do next.
  import type { Snippet } from 'svelte'

  let { title, text, icon, actions }: { title: string; text: string; icon?: Snippet; actions?: Snippet } = $props()
</script>

<div class="flex flex-col items-start gap-3 max-w-[480px]">
  {#if icon}<span class="w-14 h-14 rounded-full bg-[#1b1d18] text-text-muted flex items-center justify-center">{@render icon()}</span>{/if}
  <h2 class="m-0 font-display font-bold text-[30px] md:text-[34px] uppercase leading-none">{title}</h2>
  <p class="m-0 text-[15px] leading-[1.45] text-text-muted">{text}</p>
  {#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
</div>
```

`lobby/SwitchLobbyConfirm.svelte`:

```svelte
<script lang="ts">
  // Joining or accepting an invite while you're in another lobby (Invites-Phone): leave it first?
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  let { from, to, onconfirm, oncancel }: { from: string; to: string; onconfirm: () => void; oncancel: () => void } = $props()
</script>

<ConfirmModal title="Leave {from} to join {to}?"
  body="You can only be in one lobby at a time. Leaving takes you out of its next game, and your guests leave with you."
  confirmLabel="Leave and join" cancelLabel="Stay in {from}" {onconfirm} {oncancel} />
```

`components/Stepper.svelte`:

```svelte
<script lang="ts">
  // − N unit +: a whole number with a floor (legs, rounds).
  let { value, min = 1, label, unit, highlight = false, onchange }: {
    value: number
    min?: number
    /** What it counts, for the buttons' names: "legs" → "Fewer legs", "More legs". */
    label: string
    /** Shown after the number: n => n === 1 ? 'leg' : 'legs'. */
    unit?: (n: number) => string
    /** Not the default: the number turns lime. */
    highlight?: boolean
    onchange: (n: number) => void
  } = $props()
  const step = 'w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px] cursor-pointer font-[inherit]'
</script>

<div class="flex items-center gap-1">
  <button type="button" aria-label="Fewer {label}" onclick={() => onchange(Math.max(min, value - 1))} class={step}>−</button>
  <span class="w-12 md:w-[72px] text-center text-[15px]">
    <strong class="font-display text-[24px] {highlight ? 'text-accent' : ''}">{value}</strong>{#if unit} {unit(value)}{/if}
  </span>
  <button type="button" aria-label="More {label}" onclick={() => onchange(value + 1)} class={step}>+</button>
</div>
```

- [ ] **Step 3: Verify.** `cd backend/frontend && npm run typecheck`: 0 errors, 0 warnings. `npm run lint; echo $?`: 0. `npm test`: all pass (nothing uses the components yet; the badge and button variants mustn't break existing pages).

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/lib/components/ui/badge/badge-variants.ts backend/frontend/src/lib/components/ui/button/button-variants.ts backend/frontend/src/lib/components/lobby backend/frontend/src/lib/components/Stepper.svelte
git commit -m "feat(frontend): shared pieces for the lobby screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 8: The lobby page: header, people, history (read-only)

The page at `#/lobby`, wired to the lobby socket:
- **Header:** name, rename (host), code with copy or share link, QR code, Close (host) or Leave (others).
- **People:** in throwing order, read-only.
- **History.**

Task 9 makes the people interactive; Task 10 adds the next game and Start. Designs: `Lobby` (desktop), `Lobby-Host-Phone`, `Lobby-Phone`.

**Files:**
- Modify: `backend/frontend/package.json`, `package-lock.json` (add `uqr`)
- Modify: `backend/frontend/src/lib/lobby/format.ts` (`personLine`)
- Test: `backend/frontend/src/lib/__tests__/lobbyFormat.test.ts`
- Create in `lib/components/lobby/`:
  - `QrCode.svelte`
  - `BoardLabel.svelte`
  - `PersonStatus.svelte`
  - `PersonRow.svelte`
  - `PeopleList.svelte`
  - `ActivityFeed.svelte`
  - `LobbyHeader.svelte`
- Create: `backend/frontend/src/routes/Lobby.svelte`
- Modify: `backend/frontend/src/App.svelte` (route `/lobby`)

**Interfaces:**
- Consumes:
  - from Task 7: Avatar, Panel, EmptyState, Badge (`host`, `guest`, `ready`, `not-ready`, `sits-out`), Button (`accent`, `outline`, `destructive`)
  - Tasks 2–5
- Produces:
  - `personLine(p: LobbyPerson, people: LobbyPerson[], viewerId: string | null): string`
  - `QrCode { text: string; size?: number }`
  - `BoardLabel { person: LobbyPerson }`: the icon plus the board name (or "Manual entry"), yellow when offline
  - `PersonStatus { person: LobbyPerson }`: a read-only Sits out / Ready / Not ready badge
  - `PersonRow { person; index: number; lobby: Lobby; viewerId: string | null; board: Snippet; controls: Snippet }`
  - `PeopleList { lobby; viewerId; boardOf?: Snippet<[LobbyPerson]>; controlsOf?: Snippet<[LobbyPerson, number]>; footer?: Snippet }`. Defaults: `BoardLabel` and `PersonStatus`.
  - `ActivityFeed { activity; viewerId; since }`
  - `LobbyHeader { lobby; viewerId; onrename(name): Promise<boolean>; onnewcode(): void; onclose(): void; onleave(): void }`
  - `Lobby.svelte` keeps `lobby`, `viewerId`, `ownBoards`, `error`, `act(run)` and `withLobby(run)` for Tasks 9 and 10.

- [ ] **Step 1: Write the failing test.** In `lobbyFormat.test.ts`, import `personLine` and `type LobbyPerson`, then add:

```ts
describe('personLine', () => {
  const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
    id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
    boardOnline: false, boardMovedBy: null, usualBoardName: null, plays: true, ready: false, presence: null, ...over,
  })
  const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph' })
  const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardName: "Lena's place", usualBoardName: "Lena's place" })

  it('says whose guest someone is', () => {
    expect(personLine(person({ name: 'Pia', addedByUserId: 'lena' }), [chris, lena], 'chris')).toBe("Lena's guest")
    expect(personLine(person({ name: 'Pia', addedByUserId: 'lena' }), [chris, lena], 'lena')).toBe('Your guest')
  })

  it('says who moved someone and where they usually play', () => {
    const max = person({ userId: 'max', addedByUserId: 'max', name: 'Max', boardId: 'living', boardName: 'Living room', boardMovedBy: 'chris', usualBoardName: 'Garage' })
    expect(personLine(max, [chris, lena, max], 'chris')).toBe('Moved by you · usually Garage')
    expect(personLine(max, [chris, lena, max], 'lena')).toBe('Moved by Christoph · usually Garage')
    expect(personLine({ ...max, usualBoardName: null }, [chris, lena, max], 'lena')).toBe('Moved by Christoph')
  })

  it('is empty for someone on their usual board', () => {
    expect(personLine(lena, [chris, lena], 'chris')).toBe('')
  })
})
```

- [ ] **Step 2: Run it.** `npx vitest run src/lib/__tests__/lobbyFormat.test.ts`. Expected: FAIL, because `personLine` isn't exported.

- [ ] **Step 3: Implement.** Append to `lib/lobby/format.ts` (add `LobbyPerson` to the type import):

```ts
/** Under a person's name: whose guest they are, who put them on their board, where they usually play. */
export function personLine(p: LobbyPerson, people: LobbyPerson[], viewerId: string | null): string {
  const nameOf = (userId: string) => (userId === viewerId ? 'you' : people.find(q => q.userId === userId)?.name ?? 'someone')
  const parts: string[] = []
  if (p.userId === null) parts.push(p.addedByUserId === viewerId ? 'Your guest' : `${nameOf(p.addedByUserId)}'s guest`)
  if (p.boardMovedBy !== null) {
    parts.push(`Moved by ${nameOf(p.boardMovedBy)}`)
    if (p.usualBoardName && p.usualBoardName !== p.boardName) parts.push(`usually ${p.usualBoardName}`)
  }
  return parts.join(' · ')
}
```

  Run the test. Expected: PASS.

- [ ] **Step 4: Add the QR library.** Run `cd backend/frontend && mise exec -- npm install --save-exact uqr@0.1.2`. Then check `node_modules/uqr/dist/index.d.ts`:
  - `encode(text, options?)` returns `size: number` and `data: boolean[][]`.
  - `options.border` adds a quiet zone that's included in `size`.

  If that version's shape differs, pin the version that matches and say so in your report.

- [ ] **Step 5: Create the components.**

`lobby/QrCode.svelte`:

```svelte
<script lang="ts">
  // The join link as a QR code: people point their phone's camera at it (no in-app scanner).
  import { encode } from 'uqr'

  let { text, size = 168 }: { text: string; size?: number } = $props()
  const qr = $derived(encode(text, { border: 2 }))
</script>

<svg viewBox="0 0 {qr.size} {qr.size}" width={size} height={size} role="img" aria-label="QR code of the join link"
  shape-rendering="crispEdges" class="block shrink-0 rounded-[8px] bg-[#efeee6]">
  {#each qr.data as row, y (y)}
    {#each row as on, x (x)}
      {#if on}<rect {x} {y} width="1" height="1" fill="#0f100e" />{/if}
    {/each}
  {/each}
</svg>
```

`lobby/BoardLabel.svelte`:

```svelte
<script lang="ts">
  // Where someone plays: their board, or manual entry. Yellow while the board is offline.
  import { Keyboard, Monitor } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'

  let { person }: { person: LobbyPerson } = $props()
  const offline = $derived(person.boardId !== null && !person.boardOnline)
</script>

<span class="inline-flex items-center gap-1 min-w-0 {offline ? 'text-warn' : ''}" title={offline ? 'Board offline' : undefined}>
  {#if person.boardId === null}<Keyboard size={14} class="shrink-0" />{:else}<Monitor size={14} class="shrink-0" />{/if}
  <span class="truncate">{person.boardName ?? 'Manual entry'}</span>
</span>
```

`lobby/PersonStatus.svelte`:

```svelte
<script lang="ts">
  // Where someone stands for the next game, read-only: sits out, ready, or not ready.
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { person }: { person: LobbyPerson } = $props()
</script>

{#if !person.plays}<Badge variant="sits-out">Sits out</Badge>
{:else if person.ready}<Badge variant="ready">Ready</Badge>
{:else}<Badge variant="not-ready">Not ready</Badge>{/if}
```

`lobby/PersonRow.svelte`:

```svelte
<script lang="ts">
  // One person in the lobby list: place in the order, avatar, name and tags, where they play,
  // and on the right whatever the list puts there (status, or controls).
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import Avatar from './Avatar.svelte'
  import { personLine } from '$lib/lobby/format'

  let { person, index, lobby, viewerId, board, controls }: {
    person: LobbyPerson
    index: number
    lobby: Lobby
    viewerId: string | null
    board: Snippet
    controls: Snippet
  } = $props()
  const line = $derived(personLine(person, lobby.people, viewerId))
</script>

<li class="relative grid grid-cols-[14px_36px_minmax(0,1fr)_auto] items-center gap-[10px] min-h-[56px] box-border py-[6px] pl-[10px] pr-1 md:pr-2 rounded-[10px] bg-[#1b1d18]">
  <span class="font-mono text-[12px] text-text-dim text-center">{index + 1}</span>
  <Avatar name={person.name} guest={person.userId === null} presence={person.presence} />
  <span class="flex flex-col gap-1 min-w-0">
    <span class="flex items-center gap-[6px] min-w-0">
      <span class="text-[15px] font-semibold truncate">{person.name}</span>
      {#if person.userId !== null && person.userId === viewerId}<span class="text-[12px] font-medium text-accent shrink-0">· you</span>{/if}
      {#if person.userId !== null && person.userId === lobby.hostUserId}<Badge variant="host">Host</Badge>{/if}
      {#if person.userId === null}<Badge variant="guest">Guest</Badge>{/if}
    </span>
    <span class="flex items-center gap-[6px] min-w-0 text-[12px] text-text-muted">
      {@render board()}
      {#if line}<span class="truncate">{line}</span>{/if}
    </span>
  </span>
  <span class="flex items-center gap-[6px]">{@render controls()}</span>
</li>
```

`lobby/PeopleList.svelte`:

```svelte
<script lang="ts">
  // The people in the lobby, in throwing order. The board and the right-hand side of each row
  // are the caller's (read-only labels by default; the lobby page passes its controls).
  import type { Snippet } from 'svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import Panel from './Panel.svelte'
  import PersonRow from './PersonRow.svelte'
  import BoardLabel from './BoardLabel.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import { counts } from '$lib/lobby/rules'

  let { lobby, viewerId, boardOf, controlsOf, footer }: {
    lobby: Lobby
    viewerId: string | null
    /** What a row shows as the board (default: a read-only label). */
    boardOf?: Snippet<[LobbyPerson]>
    /** A row's right-hand side (default: a read-only status). */
    controlsOf?: Snippet<[LobbyPerson, number]>
    footer?: Snippet
  } = $props()
  const c = $derived(counts(lobby))
</script>

<Panel title="People · {c.people}" label="People in this lobby" flat>
  {#snippet note()}<ReadyCount {lobby} suffix="list order = throw order" />{/snippet}
  <ol class="m-0 p-0 list-none flex flex-col gap-[6px]">
    {#each lobby.people as p, i (p.id)}
      <PersonRow person={p} index={i} {lobby} {viewerId}>
        {#snippet board()}{#if boardOf}{@render boardOf(p)}{:else}<BoardLabel person={p} />{/if}{/snippet}
        {#snippet controls()}{#if controlsOf}{@render controlsOf(p, i)}{:else}<PersonStatus person={p} />{/if}{/snippet}
      </PersonRow>
    {/each}
  </ol>
  {#if lobby.invites.length > 0}
    <p class="m-0 text-[13px] text-text-muted">Invited · waiting for {lobby.invites.map(i => i.name).join(', ')}</p>
  {/if}
  {#if footer}<div class="md:mt-auto">{@render footer()}</div>{/if}
</Panel>
```


`lobby/ActivityFeed.svelte`:

```svelte
<script lang="ts">
  // The lobby history, newest first: who joined and left, board moves, the games played.
  import { Crown, DoorOpen, Target, Trophy, UserMinus, UserPlus, X } from '@lucide/svelte'
  import type { LobbyActivity } from '$lib/api/lobby-ws'
  import Panel from './Panel.svelte'
  import { activityLine, feedTime } from '$lib/lobby/format'

  let { activity, viewerId, since }: { activity: LobbyActivity[]; viewerId: string | null; since: string } = $props()
</script>

<Panel title="Lobby history">
  {#snippet note()}Newest first · open since {feedTime(since)}{/snippet}
  <ol class="m-0 p-0 list-none flex flex-col min-h-0 overflow-y-auto">
    {#each activity as a (a.id)}
      {@const game = a.kind === 'game_played'}
      <li class="grid grid-cols-[46px_28px_minmax(0,1fr)] items-center gap-[10px] min-h-10 border-b border-[#22251f] last:border-b-0">
        <span class="font-mono text-[12px] text-text-dim">{feedTime(a.at)}</span>
        <span class="w-7 h-7 rounded-full flex items-center justify-center {game ? 'bg-[#2b3417] text-accent' : 'bg-[#22251f] text-text-muted'}">
          {#if game}<Trophy size={14} />
          {:else if a.kind === 'game_aborted'}<X size={14} />
          {:else if a.kind === 'joined' || a.kind === 'guest_added'}<UserPlus size={14} />
          {:else if a.kind === 'left' || a.kind === 'removed'}<UserMinus size={14} />
          {:else if a.kind === 'board_moved'}<Target size={14} />
          {:else if a.kind === 'host_changed'}<Crown size={14} />
          {:else}<DoorOpen size={14} />{/if}
        </span>
        <span class="text-[14px] leading-[1.35] text-ink-2">
          {#each activityLine(a, viewerId) as part, i (i)}{#if part.bold}<strong class="text-text font-semibold">{part.text}</strong>{:else}{part.text}{/if}{/each}
        </span>
      </li>
    {:else}
      <li class="py-2 text-[14px] text-text-muted">Nothing yet.</li>
    {/each}
  </ol>
</Panel>
```

`lobby/LobbyHeader.svelte`:

```svelte
<script lang="ts">
  // The lobby's name (the host renames it), who hosts, the code and a link to join, the QR code,
  // and Close (the host) or Leave (everyone else).
  import { Check, Copy, Pencil, QrCode as QrIcon, RefreshCw, Share2 } from '@lucide/svelte'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import QrCode from './QrCode.svelte'
  import { formatCode, joinLink } from '$lib/lobby/format'
  import { boardSummary, counts, isHost } from '$lib/lobby/rules'

  let { lobby, viewerId, onrename, onnewcode, onclose, onleave }: {
    lobby: Lobby
    viewerId: string | null
    /** Resolves true once the name is saved. */
    onrename: (name: string) => Promise<boolean>
    /** The host makes a new code; the old link and QR code stop working. */
    onnewcode: () => void
    onclose: () => void
    onleave: () => void
  } = $props()

  const host = $derived(isHost(lobby, viewerId))
  const hostName = $derived(lobby.people.find(p => p.userId !== null && p.userId === lobby.hostUserId)?.name ?? null)
  const link = $derived(joinLink(window.location.origin, lobby.code))
  const c = $derived(counts(lobby))
  const boards = $derived(boardSummary(lobby))
  const myGuests = $derived(lobby.people.filter(p => p.userId === null && p.addedByUserId === viewerId).map(p => p.name))
  const leaveBody = $derived(myGuests.length === 0
    ? 'You can join again with the code.'
    : `${myGuests.join(', ')} ${myGuests.length === 1 ? 'leaves' : 'leave'} with you.`)

  let renaming = $state(false)
  let draft = $state('')
  let copied = $state(false)
  let showQr = $state(false)
  let confirm = $state<'close' | 'leave' | 'code' | null>(null)
  const iconButton = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] cursor-pointer'

  async function saveName() {
    const name = draft.trim()
    if (!name || name === lobby.name) { renaming = false; return }
    if (await onrename(name)) renaming = false
  }

  async function share() {
    // Phones hand the link to messages or mail; elsewhere (or when that's cancelled) it's copied
    if ('share' in navigator) {
      try { await navigator.share({ title: lobby.name, url: link }); return } catch { /* copy instead */ }
    }
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      setTimeout(() => { copied = false }, 2000)
    } catch { /* no clipboard: the code is on screen */ }
  }
</script>

<header class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-6">
  <div class="flex flex-col gap-1 md:gap-2 min-w-0">
    {#if renaming}
      <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); void saveName() }}>
        <input bind:value={draft} maxlength="48" aria-label="Lobby name"
          class="h-11 min-w-0 flex-grow box-border px-3 rounded-[9px] bg-bg border border-line-chip text-text text-[18px] font-[inherit]" />
        <Button variant="accent" type="submit" aria-label="Save the name" class="w-11 px-0"><Check size={18} strokeWidth={2.5} /></Button>
      </form>
    {:else}
      <div class="flex items-center gap-3 min-w-0">
        <h2 class="m-0 font-display font-bold text-[34px] md:text-[48px] leading-none uppercase tracking-[0.02em] truncate">{lobby.name}</h2>
        {#if host}
          <button type="button" aria-label="Rename the lobby" onclick={() => { draft = lobby.name; renaming = true }}
            class="{iconButton} bg-transparent border border-line-chip text-ink-2"><Pencil size={16} /></button>
        {/if}
      </div>
    {/if}
    <p class="m-0 flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[13px] md:text-[15px] text-text-muted">
      <span class="inline-flex items-center gap-[6px] text-accent font-semibold"><span class="w-2 h-2 rounded-full bg-accent"></span>Lobby open</span>
      <span>· {host ? "You're the host" : `Hosted by ${hostName ?? 'nobody yet'}`}</span>
      <span>· {c.people} {c.people === 1 ? 'person' : 'people'}</span>
      {#if boards}<span>· {boards}</span>{/if}
    </p>
  </div>

  <div class="flex items-center gap-2 md:gap-[10px] flex-wrap">
    <div class="flex items-center gap-[10px] md:gap-3 h-[46px] md:h-12 box-border pl-3 md:pl-4 pr-[6px] md:pr-2 border border-line-chip rounded-[10px] bg-surface-panel">
      <span class="text-[12px] md:text-[13px] text-text-muted">Code</span>
      <span class="font-mono text-[17px] md:text-[20px] font-medium tracking-[0.12em]">{formatCode(lobby.code)}</span>
      <button type="button" onclick={() => void share()}
        class="h-9 px-[10px] md:px-3 flex items-center gap-[6px] border-0 rounded-[8px] bg-surface-key text-text text-[13px] md:text-[14px] font-semibold cursor-pointer font-[inherit]">
        {#if copied}
          <Check size={15} />Copied
        {:else}
          <span class="md:hidden flex items-center gap-[6px]"><Share2 size={15} />Share link</span>
          <span class="hidden md:flex items-center gap-[6px]"><Copy size={15} />Copy link</span>
        {/if}
      </button>
      <button type="button" aria-label="Show the QR code" aria-expanded={showQr} onclick={() => showQr = !showQr}
        class="{iconButton} border-0 bg-surface-key text-text"><QrIcon size={17} /></button>
      {#if host}
        <button type="button" aria-label="Make a new code" title="New code" onclick={() => confirm = 'code'}
          class="{iconButton} border-0 bg-surface-key text-text"><RefreshCw size={16} /></button>
      {/if}
    </div>
    <Button variant="destructive" onclick={() => confirm = host ? 'close' : 'leave'} class="h-[46px] md:h-12">
      {host ? 'Close lobby' : 'Leave lobby'}
    </Button>
  </div>
</header>

{#if showQr}
  <div class="self-start md:self-end flex items-center gap-4 p-4 rounded-[14px] bg-surface-panel border border-line-2">
    <QrCode text={link} />
    <p class="m-0 max-w-[200px] text-[14px] leading-[1.45] text-text-muted">
      Point a phone's camera here to join <strong class="text-text">{lobby.name}</strong>.
    </p>
  </div>
{/if}

{#if confirm === 'close'}
  <ConfirmModal title="Close {lobby.name}?" body="Everyone leaves the lobby and pending invites expire."
    confirmLabel="Close lobby" cancelLabel="Keep it open" danger
    onconfirm={() => { confirm = null; onclose() }} oncancel={() => confirm = null} />
{:else if confirm === 'leave'}
  <ConfirmModal title="Leave {lobby.name}?" body={leaveBody} confirmLabel="Leave lobby" cancelLabel="Stay" danger
    onconfirm={() => { confirm = null; onleave() }} oncancel={() => confirm = null} />
{:else if confirm === 'code'}
  <ConfirmModal title="Make a new code?" body="The old code, link and QR code stop working. People already in the lobby stay."
    confirmLabel="New code" cancelLabel="Keep this one"
    onconfirm={() => { confirm = null; onnewcode() }} oncancel={() => confirm = null} />
{/if}
```

- [ ] **Step 6: The page.** `backend/frontend/src/routes/Lobby.svelte`:

```svelte
<script lang="ts">
  // The lobby: who's in, on which boards, the next game, the history. It all comes from the
  // lobby socket; changes go through the REST API and come back on the socket.
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import LobbyHeader from '$lib/components/lobby/LobbyHeader.svelte'
  import PeopleList from '$lib/components/lobby/PeopleList.svelte'
  import ActivityFeed from '$lib/components/lobby/ActivityFeed.svelte'
  import { api } from '$lib/api'
  import type { Lobby } from '$lib/api/lobby-ws'
  import { currentUser } from '$lib/auth'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import type { OwnBoard } from '$lib/lobby/rules'
  import { createLobbyStore, type LobbyEnd } from '$lib/lobby/sockets'

  let lobby = $state<Lobby | null>(null)
  let ended = $state<LobbyEnd | null>(null)
  let phase = $state<'loading' | 'none' | 'open'>('loading')
  let ownBoards = $state<OwnBoard[]>([])
  let error = $state('')
  let socket: ReturnType<typeof createLobbyStore> | null = null
  let unsubs: (() => void)[] = []
  const viewerId = $derived($currentUser?.id ?? null)

  function open(lobbyId: string) {
    socket?.destroy()
    unsubs.forEach(u => u())
    lobby = null
    ended = null
    socket = createLobbyStore(lobbyId)
    unsubs = [socket.lobby.subscribe(l => { lobby = l }), socket.ended.subscribe(e => { ended = e })]
    phase = 'open'
  }

  async function load() {
    const [cur, boards] = await Promise.all([api.GET('/api/lobbies/current'), api.GET('/api/boards')])
    ownBoards = (boards.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
    if (cur.data) open(cur.data.id)
    else phase = 'none'
  }

  /** Runs a change; a refusal shows above the lists. Resolves true when it went through. */
  async function act(run: () => Promise<{ error?: Refusal }>): Promise<boolean> {
    const { error: refusal } = await run()
    error = refusal ? describeConflict(refusal) : ''
    return !refusal
  }
  function withLobby(run: (id: string) => Promise<{ error?: Refusal }>): Promise<boolean> {
    const id = lobby?.id
    return id ? act(() => run(id)) : Promise.resolve(false)
  }

  async function create() {
    const res = await api.POST('/api/lobbies')
    if (res.data) open(res.data.id)
    else error = describeConflict(res.error)
  }
  const rename = (name: string) => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { name } }))
  const newCode = () => withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { regenerateCode: true } }))
  const close = () => withLobby(id => api.POST('/api/lobbies/{id}/close', { params: { path: { id } } }))
  async function leave() {
    if (await withLobby(id => api.POST('/api/lobbies/{id}/leave', { params: { path: { id } } }))) void push('/')
  }

  onMount(() => { void load() })
  onDestroy(() => { socket?.destroy(); unsubs.forEach(u => u()) })
</script>

{#snippet startOrJoin()}
  <Button variant="accent" onclick={() => void create()}>Create lobby</Button>
  <Button variant="outline" href="#/join" class="h-11">Join with a code</Button>
{/snippet}

<Layout title="Lobby">
  <main class="flex flex-grow flex-col gap-4 md:gap-[22px] box-border min-w-0 overflow-y-auto p-4 md:px-11 md:py-8">
    {#if ended}
      <EmptyState title={ended === 'closed' ? 'The lobby was closed' : "You're no longer in the lobby"}
        text="Start a new lobby, join one with a code, or play a game of your own." actions={startOrJoin} />
    {:else if phase === 'none'}
      <EmptyState title="You're not in a lobby"
        text="A lobby keeps your crew together between games: everyone joins once, on their own board or phone."
        actions={startOrJoin} />
      {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
    {:else if lobby}
      <LobbyHeader {lobby} {viewerId} onrename={rename} onnewcode={() => void newCode()} onclose={() => void close()} onleave={() => void leave()} />
      {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
      <div class="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,580px)_minmax(0,1fr)] md:gap-5 md:flex-grow md:min-h-0">
        <div class="order-2 md:order-none flex flex-col min-w-0 md:min-h-0">
          <PeopleList {lobby} {viewerId} />
        </div>
        <div class="order-1 md:order-none flex flex-col gap-4 md:gap-5 min-w-0 md:min-h-0">
          <!-- Task 10: the running-game bar and the next game go here -->
          <div class="hidden md:flex md:flex-col md:min-h-0"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
        </div>
        <div class="order-3 md:hidden"><ActivityFeed activity={lobby.activity} {viewerId} since={lobby.createdAt} /></div>
      </div>
    {:else}
      <p class="m-0 text-[15px] text-text-muted">Loading the lobby…</p>
    {/if}
  </main>
</Layout>
```

  - The layout: on phones it's header, next game (Task 10), people, history; on desktop, people on the left and the next game plus history on the right.
  - In `App.svelte`, import `Lobby from './routes/Lobby.svelte'` and add `'/lobby': Lobby,`.
  - `res.error` on a failed create is `ErrorResponse | LobbyConflict`. Both fit `Refusal` (Task 4), so `describeConflict(res.error)` typechecks.

- [ ] **Step 7: Verify.**
  - `npm test` passes. `npm run typecheck` reports 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - In the dev stack (signed in with a dev login), open `#/lobby` and press Create lobby. You should see the header, yourself in People, and "You opened the lobby" in the history.
  - Check at 1440 wide and 390 wide, and check the QR code by scanning it with a phone.

- [ ] **Step 8: Commit**

```bash
git add backend/frontend/package.json backend/frontend/package-lock.json backend/frontend/src/lib/lobby/format.ts backend/frontend/src/lib/__tests__/lobbyFormat.test.ts backend/frontend/src/lib/components/lobby backend/frontend/src/routes/Lobby.svelte backend/frontend/src/App.svelte
git commit -m "feat(frontend): the lobby page: header, people, history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 9: Changing people: boards, in or out, ready, order, removing, adding

**Files:**
- Modify: `backend/frontend/src/lib/lobby/rules.ts` (`PersonPatch`)
- Create in `lib/components/lobby/`: `BoardChip.svelte`, `RowMenu.svelte`, `PersonControls.svelte`, `AddSomeone.svelte`
- Modify: `backend/frontend/src/routes/Lobby.svelte`

**Interfaces:**
- Consumes:
  - from Task 7: PopoverMenu, MenuItem, MenuPanel, ToggleChip, Button
  - from Task 8: BoardLabel, PersonStatus, PeopleList (`boardOf`, `controlsOf`, `footer`)
  - from Task 3: `boardChoices`, `canMove`, `canRemove`, `canSetPlays`, `canSetReady`, `OwnBoard`
  - from Task 4: `parseAddInput`
- Produces:
  - `export type PersonPatch = components['schemas']['UpdatePersonRequest']` (in `rules.ts`)
  - `BoardChip { person: LobbyPerson; choices: BoardChoice[]; onpick: (boardId: string | null) => void }`
  - `RowMenu { name: string; onup?: () => void; ondown?: () => void; onremove?: () => void }`
  - `PersonControls { lobby: Lobby; person: LobbyPerson; index: number; viewerId: string | null; onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>; onremove: (personId: string) => Promise<boolean> }`
  - `AddSomeone { onguest: (name: string) => Promise<boolean>; oninvite: (userId: string) => Promise<boolean> }`
  - in `Lobby.svelte`: `updatePerson(personId, patch)`, `removePerson`, `addGuest`, `invite`, all returning `Promise<boolean>`

- [ ] **Step 1: The patch type.** In `lib/lobby/rules.ts`:

```ts
import type { components } from '../api/schema'

/** A change to one person (PATCH /api/lobbies/:id/people/:pid): board, who plays, ready, place. */
export type PersonPatch = components['schemas']['UpdatePersonRequest']
```

- [ ] **Step 2: The components.**

`lobby/BoardChip.svelte`:

```svelte
<script lang="ts">
  // A person's board as a chip that opens what the board rule lets the viewer pick; a plain
  // label when there's nothing to pick.
  import { ChevronDown } from '@lucide/svelte'
  import type { LobbyPerson } from '$lib/api/lobby-ws'
  import type { BoardChoice } from '$lib/lobby/rules'
  import BoardLabel from './BoardLabel.svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverMenu from './PopoverMenu.svelte'

  let { person, choices, onpick }: {
    person: LobbyPerson
    choices: BoardChoice[]
    /** null: manual entry */
    onpick: (boardId: string | null) => void
  } = $props()
</script>

{#if choices.length === 0}
  <BoardLabel {person} />
{:else}
  <PopoverMenu label="Choose a board for {person.name}"
    triggerLabel="Board for {person.name}: {person.boardName ?? 'manual entry'}. Change board"
    triggerClass="max-w-full h-[30px] md:h-[34px] box-border inline-flex items-center gap-[6px] pl-[10px] pr-2 rounded-[8px] border bg-[#22251f] text-ink-soft text-[13px] font-semibold
                  {person.boardMovedBy !== null ? 'border-[#5c7323]' : 'border-line-chip'}">
    {#snippet trigger()}<BoardLabel {person} /><ChevronDown size={14} class="shrink-0" />{/snippet}
    {#snippet children(close)}
      {#each choices as c (c.boardId ?? 'manual')}
        <MenuItem label={c.label} detail={c.detail} checked={c.current} onclick={() => { close(); if (!c.current) onpick(c.boardId) }} />
      {/each}
      {#if person.usualBoardName}
        <span class="px-[10px] pt-[6px] pb-1 text-[12px] text-text-dim">{person.name} usually plays on {person.usualBoardName}</span>
      {/if}
    {/snippet}
  </PopoverMenu>
{/if}
```

`lobby/RowMenu.svelte`:

```svelte
<script lang="ts">
  // The ⋯ on a person's row: move up or down (the host), remove (the host; members for their guests).
  import { Ellipsis } from '@lucide/svelte'
  import MenuItem from './MenuItem.svelte'
  import PopoverMenu from './PopoverMenu.svelte'

  let { name, onup, ondown, onremove }: {
    name: string
    /** Absent: that's not possible (first or last, not the host, not yours). */
    onup?: () => void
    ondown?: () => void
    onremove?: () => void
  } = $props()
</script>

{#if onup || ondown || onremove}
  <PopoverMenu label="More for {name}" triggerLabel="More for {name}" align="right" width={200}
    triggerClass="w-9 h-11 md:h-9 flex items-center justify-center bg-transparent border-0 md:border md:border-solid md:border-line-chip rounded-[8px] text-text-muted">
    {#snippet trigger()}<Ellipsis size={18} />{/snippet}
    {#snippet children(close)}
      {#if onup}{@const f = onup}<MenuItem label="Move up" onclick={() => { close(); f() }} />{/if}
      {#if ondown}{@const f = ondown}<MenuItem label="Move down" onclick={() => { close(); f() }} />{/if}
      {#if onremove}{@const f = onremove}<MenuItem label="Remove from lobby" danger onclick={() => { close(); f() }} />{/if}
    {/snippet}
  </PopoverMenu>
{/if}
```

`lobby/PersonControls.svelte`:

```svelte
<script lang="ts">
  // The right-hand side of a person's row on the lobby page: "In" / "Sits out" and Ready for
  // your own rows (read-only status for others), and the ⋯ menu with what you may do.
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import PersonStatus from './PersonStatus.svelte'
  import RowMenu from './RowMenu.svelte'
  import ToggleChip from './ToggleChip.svelte'
  import { canMove, canRemove, canSetReady, type PersonPatch } from '$lib/lobby/rules'

  let { lobby, person, index, viewerId, onupdate, onremove }: {
    lobby: Lobby
    person: LobbyPerson
    index: number
    viewerId: string | null
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
    onremove: (personId: string) => Promise<boolean>
  } = $props()

  // Your own rows only: the host sits others out with the who-plays chips on the next-game card
  const mine = $derived(canSetReady(person, viewerId))
  const mover = $derived(canMove(lobby, viewerId))
  const last = $derived(lobby.people.length - 1)
  let removing = $state(false)
</script>

{#if mine}
  <ToggleChip on={person.plays} onclick={() => void onupdate(person.id, { plays: !person.plays })}
    label={person.plays ? `${person.name} plays the next game. Sit out` : `${person.name} sits out. Play the next game`}>
    {person.plays ? 'In' : 'Sits out'}
  </ToggleChip>
  {#if person.plays}
    <ToggleChip tone="solid" on={person.ready} onclick={() => void onupdate(person.id, { ready: !person.ready })}
      label={person.ready ? `${person.name} is ready. Mark as not ready` : `${person.name} is not ready. Mark as ready`}>
      {person.ready ? 'Ready' : 'Ready?'}
    </ToggleChip>
  {/if}
{:else}
  <PersonStatus {person} />
{/if}
<RowMenu name={person.name}
  onup={mover && index > 0 ? () => void onupdate(person.id, { position: index - 1 }) : undefined}
  ondown={mover && index < last ? () => void onupdate(person.id, { position: index + 1 }) : undefined}
  onremove={canRemove(lobby, person, viewerId) ? () => { removing = true } : undefined} />

{#if removing}
  <ConfirmModal title="Remove {person.name}?"
    body={person.userId !== null ? `${person.name} leaves the lobby, and their guests leave with them.` : `${person.name} leaves the lobby.`}
    confirmLabel="Remove" cancelLabel="Keep" danger
    onconfirm={() => { removing = false; void onremove(person.id) }} oncancel={() => removing = false} />
{/if}
```

`lobby/AddSomeone.svelte`:

```svelte
<script lang="ts">
  // "Name or @username": a plain name adds a guest at your board, @ finds an account to invite.
  import { Plus } from '@lucide/svelte'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import MenuItem from './MenuItem.svelte'
  import MenuPanel from './MenuPanel.svelte'
  import { parseAddInput } from '$lib/lobby/input'

  type Account = { id: string; name: string }
  let { onguest, oninvite }: {
    onguest: (name: string) => Promise<boolean>
    oninvite: (userId: string) => Promise<boolean>
  } = $props()

  let text = $state('')
  let hint = $state('')
  let matches = $state<Account[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  const parsed = $derived(parseAddInput(text))
  const query = $derived(parsed.kind === 'invite' ? parsed.query : '')

  // @name searches accounts (debounced), as in the new-game player list
  $effect(() => {
    const q = query
    clearTimeout(timer)
    if (!q) { matches = []; return }
    timer = setTimeout(() => {
      api.GET('/api/users', { params: { query: { q } } })
        .then(({ data }) => { if (q === query) matches = data?.users ?? [] })
        .catch(() => { matches = [] })
    }, 200)
  })

  async function invite(u: Account) {
    if (await oninvite(u.id)) { text = ''; matches = [] }
  }

  async function submit() {
    hint = ''
    if (parsed.kind === 'invalid') { hint = parsed.hint; return }
    if (parsed.kind === 'invite') {
      const only = matches.length === 1 ? matches[0] : null
      if (only) await invite(only)
      else hint = matches.length === 0 ? `No account matches @${parsed.query}` : 'Pick who to invite from the list'
      return
    }
    if (await onguest(parsed.name)) text = ''
  }
</script>

<div class="flex flex-col gap-2">
  <form class="relative flex gap-2" onsubmit={(e) => { e.preventDefault(); void submit() }}>
    <label for="add-person" class="sr-only">Add someone: name or @username</label>
    <input id="add-person" bind:value={text} placeholder="Name or @username" autocomplete="off" autocapitalize="off"
      class="flex-grow min-w-0 h-11 box-border px-3 md:px-[14px] bg-bg border border-line-chip rounded-[9px] text-text text-[15px] font-[inherit]" />
    <Button variant="outline" type="submit" class="h-11 bg-surface-key border-0 font-semibold">
      <Plus size={16} />{parsed.kind === 'invite' ? 'Invite' : 'Add guest'}
    </Button>
    {#if matches.length > 0}
      <MenuPanel label="Accounts matching @{query}" align="stretch">
        {#each matches as u (u.id)}<MenuItem label="Invite {u.name}" onclick={() => void invite(u)} />{/each}
      </MenuPanel>
    {/if}
  </form>
  <span class="text-[12px] {hint ? 'text-live-text' : 'text-text-dim'}">
    {hint || 'A @username gets an invite. A plain name adds a guest at your board.'}
  </span>
</div>
```

- [ ] **Step 3: Wire it up in `Lobby.svelte`.**
  - Add to the script (import `type PersonPatch` from `$lib/lobby/rules`, and `BoardChip`, `PersonControls` and `AddSomeone` from `$lib/components/lobby/`):

```ts
  const updatePerson = (personId: string, patch: PersonPatch) =>
    withLobby(id => api.PATCH('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } }, body: patch }))
  const removePerson = (personId: string) =>
    withLobby(id => api.DELETE('/api/lobbies/{id}/people/{personId}', { params: { path: { id, personId } } }))
  const addGuest = (name: string) =>
    withLobby(id => api.POST('/api/lobbies/{id}/people', { params: { path: { id } }, body: { name } }))
  const invite = (userId: string) =>
    withLobby(id => api.POST('/api/lobbies/{id}/invites', { params: { path: { id } }, body: { userId } }))
```

  - Replace `<PeopleList {lobby} {viewerId} />` with:

```svelte
          <PeopleList {lobby} {viewerId}>
            {#snippet boardOf(p)}
              <BoardChip person={p} choices={boardChoices(p, viewerId, ownBoards)} onpick={(boardId) => void updatePerson(p.id, { boardId })} />
            {/snippet}
            {#snippet controlsOf(p, i)}
              <PersonControls lobby={l} person={p} index={i} {viewerId} onupdate={updatePerson} onremove={removePerson} />
            {/snippet}
            {#snippet footer()}<AddSomeone onguest={addGuest} oninvite={invite} />{/snippet}
          </PeopleList>
```

  `boardChoices` comes from `$lib/lobby/rules`. Snippets are closures, so TypeScript doesn't carry the `{:else if lobby}` narrowing into them. Add `{@const l = lobby}` as the first line inside the `{:else if lobby}` branch and use `l` in the snippets, as above.

- [ ] **Step 4: Verify.**
  - `npm test` passes. `npm run typecheck` reports 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - Browser, with Admin in one window and Luke in a private one. Luke joins: Task 12's Join page doesn't exist yet, so from Luke's devtools run `fetch('/api/lobbies/<id>/join', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({code:'<code>'})})`. Then check:
    - **Admin's board chip for Luke** (Luke is on manual entry): it offers Admin's boards.
    - **Luke's view of Admin's row:** a plain label, no menu.
    - **In and Ready:** they toggle on your own row only.
    - **Admin's ⋯ menu:** Move down and Remove work.
    - **Adding a guest:** `Pia` + Enter adds a guest.
    - **Inviting a member:** `@luke` lists Luke; picking him says "They're already in the lobby".

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/rules.ts backend/frontend/src/lib/components/lobby backend/frontend/src/routes/Lobby.svelte
git commit -m "feat(frontend): change boards, ready, order and people in a lobby

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 10: The next game: the host's card, the member panel, Start and Rematch

**The host** (`Lobby`, `Lobby-Host-Phone`) sees:
- the next game and its X01 settings
- "Who plays" chips and the throw order
- **Start · N players**, and **Rematch** once a game was played
- a soft ready gate ("Not ready yet: … Start anyway?")

**Members** (`Lobby-Phone`) see the host's pick, **I'm in / Sitting this one out**, and **Ready**.

**Everyone with a seat** goes to the game when it starts (decision 7). While it runs, a bar offers "Back to game" or "Watch".

**Files:**
- Modify: `backend/frontend/src/lib/lobby/rules.ts` (`LobbyPatch`)
- Create in `lib/components/lobby/`: `NextGameSummary.svelte`, `X01Settings.svelte`, `WhoPlays.svelte`, `GameRunningBar.svelte`, `NextGameCard.svelte`, `MemberPanel.svelte`
- Modify: `backend/frontend/src/routes/Lobby.svelte`

**Interfaces:**
- Consumes:
  - from Task 7: Button, Field, ReadyCount, ToggleChip, Avatar, Stepper; also SegmentedControl
  - from Task 6: `startGame`, `shouldOpenGame`
  - from Task 3: `counts`, `boardSummary`, `isHost`, `myRow`, `playsInGame`
- Produces:
  - `export type LobbyPatch = components['schemas']['UpdateLobbyRequest']` (in `rules.ts`)
  - `NextGameSummary { game: NextGame | null; pickedBy: string; size?: 'lg' | 'sm' }`
  - `X01Settings { config: Record<string, unknown>; onchange: (key: string, value: unknown) => void }`
  - `WhoPlays { lobby: Lobby; onplays: (personId: string, plays: boolean) => void }`
  - `GameRunningBar { sessionId: string; playing: boolean }`
  - `NextGameCard { lobby; onupdate: (patch: LobbyPatch) => Promise<boolean>; onplays: (personId: string, plays: boolean) => Promise<boolean>; onstart: (rematch: boolean) => void }`
  - `MemberPanel { lobby; me: LobbyPerson; onupdate: (personId: string, patch: PersonPatch) => Promise<boolean> }`

- [ ] **Step 1: The patch type.** Below `PersonPatch` in `lib/lobby/rules.ts`:

```ts
/** A change to the lobby (PATCH /api/lobbies/:id, the host): name, throw order, next game, a new code. */
export type LobbyPatch = components['schemas']['UpdateLobbyRequest']
```

- [ ] **Step 2: The components.**

`lobby/NextGameSummary.svelte`:

```svelte
<script lang="ts">
  // The next game at a glance: the big number (X01's start score, or the mode), whose pick,
  // the mode and its settings.
  import type { NextGame } from '$lib/api/lobby-ws'
  import { gameName, nextGameSummary } from '$lib/lobby/format'

  let { game, pickedBy, size = 'lg' }: { game: NextGame | null; pickedBy: string; size?: 'lg' | 'sm' } = $props()
  const big = $derived(game?.gameId === 'x01' && typeof game.config.startScore === 'number'
    ? String(game.config.startScore)
    : game ? game.gameId.toUpperCase() : '—')
</script>

<div class="flex items-start gap-[14px] md:gap-[18px]">
  <span class="font-display font-bold leading-[0.85] text-accent {size === 'lg' ? 'text-[52px] md:text-[72px]' : 'text-[44px]'}">{big}</span>
  <div class="flex flex-col gap-[2px] md:gap-1 flex-grow min-w-0">
    <span class="text-[11px] md:text-[12px] tracking-[0.1em] uppercase text-text-muted">Next game · {pickedBy}</span>
    <h3 class="m-0 font-display font-bold leading-none uppercase {size === 'lg' ? 'text-[24px] md:text-[32px]' : 'text-[20px]'}">{game ? gameName(game.gameId) : 'No game yet'}</h3>
    {#if game}<span class="text-[13px] md:text-[15px] text-ink-2">{nextGameSummary(game)}</span>{/if}
  </div>
</div>
```

`lobby/X01Settings.svelte`:

```svelte
<script lang="ts">
  // The lobby's inline X01 settings (Lobby, Lobby-Host-Phone): start score, check-out, first to.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Stepper from '$lib/components/Stepper.svelte'
  import Field from './Field.svelte'

  let { config, onchange }: { config: Record<string, unknown>; onchange: (key: string, value: unknown) => void } = $props()

  const STARTS = [301, 501, 701].map(v => ({ value: v, label: String(v) }))
  const OUTS = [{ value: 'straight', label: 'Straight' }, { value: 'double', label: 'Double' }, { value: 'master', label: 'Master' }]
  const legs = $derived(typeof config.firstTo === 'number' ? config.firstTo : 1)
</script>

<div class="flex flex-col gap-3 p-[14px] rounded-[12px] bg-surface-panel border border-line-2">
  <Field label="Start score"><SegmentedControl options={STARTS} value={config.startScore} onchange={(v) => onchange('startScore', v)} /></Field>
  <Field label="Check-out"><SegmentedControl options={OUTS} value={config.outMode} onchange={(v) => onchange('outMode', v)} /></Field>
  <div class="flex items-center justify-between">
    <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">First to</span>
    <Stepper value={legs} label="legs" unit={(n) => (n === 1 ? 'leg' : 'legs')} onchange={(n) => onchange('firstTo', n)} />
  </div>
  <span class="text-[12px] text-text-dim">Changes show up on everyone's phone right away.</span>
</div>
```

`lobby/WhoPlays.svelte`:

```svelte
<script lang="ts">
  // Who plays the next game: a chip per person; the host taps one to sit them out or back in.
  import type { Lobby } from '$lib/api/lobby-ws'
  import Avatar from './Avatar.svelte'
  import ToggleChip from './ToggleChip.svelte'
  import { boardSummary } from '$lib/lobby/rules'

  let { lobby, onplays }: { lobby: Lobby; onplays: (personId: string, plays: boolean) => void } = $props()
</script>

<div class="flex flex-col gap-2">
  <span class="flex justify-between gap-2">
    <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">Who plays · tap to sit someone out</span>
    <span class="text-[12px] md:text-[13px] text-text-muted text-right">{boardSummary(lobby)}</span>
  </span>
  <div class="flex flex-wrap gap-2">
    {#each lobby.people as p (p.id)}
      <ToggleChip size="md" on={p.plays} onclick={() => onplays(p.id, !p.plays)}>
        <Avatar name={p.name} guest={p.userId === null} size={28} />{p.name}
        {#if !p.plays}<span class="text-[12px]">· sits out</span>{/if}
      </ToggleChip>
    {/each}
  </div>
</div>
```

`lobby/GameRunningBar.svelte`:

```svelte
<script lang="ts">
  // While the lobby's game runs: the way into it.
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'

  let { sessionId, playing }: { sessionId: string; playing: boolean } = $props()
</script>

<div class="flex items-center gap-3 h-12 px-4 rounded-[12px] bg-surface-active border border-accent-line">
  <span class="w-2 h-2 rounded-full bg-live animate-pulse motion-reduce:animate-none"></span>
  <span class="text-[14px] font-semibold">Game running</span>
  <Button variant="accent" class="ml-auto h-9 px-3 text-[13px]" onclick={() => void push(`/session/${sessionId}`)}>
    {playing ? 'Back to game' : 'Watch'}
  </Button>
</div>
```

`lobby/NextGameCard.svelte`:

```svelte
<script lang="ts">
  // The host's next-game card: the game (with inline X01 settings), who plays, throw order,
  // Start, and Rematch once a game was played.
  import { ArrowRight, RotateCcw, Settings } from '@lucide/svelte'
  import type { Lobby, ThrowOrder } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Field from './Field.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import WhoPlays from './WhoPlays.svelte'
  import X01Settings from './X01Settings.svelte'
  import { counts, type LobbyPatch } from '$lib/lobby/rules'

  let { lobby, onupdate, onplays, onstart }: {
    lobby: Lobby
    onupdate: (patch: LobbyPatch) => Promise<boolean>
    onplays: (personId: string, plays: boolean) => Promise<boolean>
    onstart: (rematch: boolean) => void
  } = $props()

  const ORDERS = [{ value: 'lobby', label: 'Lobby order' }, { value: 'random', label: 'Random' }, { value: 'bulloff', label: 'Bull-off' }]
  const isOrder = (v: unknown): v is ThrowOrder => v === 'lobby' || v === 'random' || v === 'bulloff'

  const c = $derived(counts(lobby))
  const game = $derived(lobby.nextGame)
  const x01 = $derived(game?.gameId === 'x01')
  const running = $derived(lobby.currentSessionId !== null)
  let settingsOpen = $state(false)

  function setConfig(key: string, value: unknown) {
    if (game) void onupdate({ nextGame: { gameId: game.gameId, config: { ...game.config, [key]: value } } })
  }
</script>

<section aria-label="Next game"
  class="box-border p-4 md:px-6 md:py-[22px] rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[14px] md:gap-[18px]">
  <NextGameSummary {game} pickedBy="picked by you" />
  <div class="grid grid-cols-2 gap-2">
    {#if x01}
      <Button variant="outline" class="h-11 font-semibold {settingsOpen ? 'bg-[#2b3417]' : ''}" aria-expanded={settingsOpen}
        onclick={() => settingsOpen = !settingsOpen}><Settings size={16} />Settings</Button>
    {/if}
    <Button variant="outline" href="#/" class="h-11 font-semibold {x01 ? '' : 'col-span-2'}">{game ? 'Change game' : 'Pick a game'}</Button>
  </div>
  {#if settingsOpen && game && x01}<X01Settings config={game.config} onchange={setConfig} />{/if}
  <WhoPlays {lobby} onplays={(personId, plays) => void onplays(personId, plays)} />
  <Field label="Throw order">
    <SegmentedControl options={ORDERS} value={lobby.throwOrder} onchange={(v) => { if (isOrder(v)) void onupdate({ throwOrder: v }) }} />
  </Field>
  <div class="flex flex-col gap-[6px]">
    <div class="flex gap-2">
      <Button class="flex-grow h-14" disabled={!game || running || c.playing === 0} onclick={() => onstart(false)}>
        Start · {c.playing} {c.playing === 1 ? 'player' : 'players'}<ArrowRight size={20} strokeWidth={2.2} />
      </Button>
      {#if lobby.canRematch}
        <Button variant="outline" class="h-14 font-semibold" disabled={running} aria-label="Rematch: the last game again, same players"
          onclick={() => onstart(true)}><RotateCcw size={18} />Rematch</Button>
      {/if}
    </div>
    <span class="text-[13px]"><ReadyCount {lobby} suffix="you can start anyway" /></span>
  </div>
</section>
```

`lobby/MemberPanel.svelte`:

```svelte
<script lang="ts">
  // A member's next-game card (Lobby-Phone): the host's pick, "I'm in" or sitting this one out, and Ready.
  import { Check } from '@lucide/svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import type { PersonPatch } from '$lib/lobby/rules'

  let { lobby, me, onupdate }: {
    lobby: Lobby
    me: LobbyPerson
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
  } = $props()

  const PLAYS = [{ value: true, label: "I'm in" }, { value: false, label: 'Sitting this one out' }]
  const hostName = $derived(lobby.people.find(p => p.userId !== null && p.userId === lobby.hostUserId)?.name ?? 'The host')
</script>

<section aria-label="Next game" class="p-[14px] md:p-5 rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[10px]">
  <NextGameSummary game={lobby.nextGame} pickedBy="{hostName}'s pick" size="sm" />
  <SegmentedControl options={PLAYS} value={me.plays} onchange={(v) => { if (v !== me.plays) void onupdate(me.id, { plays: v === true }) }} />
  {#if !me.plays}
    <Button variant="ghost" disabled class="h-12 border-dashed">Ready · not needed this game</Button>
  {:else if me.ready}
    <Button variant="accent" class="h-12" aria-pressed="true" onclick={() => void onupdate(me.id, { ready: false })}>
      <Check size={18} strokeWidth={3} />Ready
    </Button>
  {:else}
    <Button variant="outline" class="h-12 border-2 border-accent text-accent text-[15px] font-bold" aria-pressed="false"
      onclick={() => void onupdate(me.id, { ready: true })}>I'm ready</Button>
  {/if}
  <div class="flex justify-between gap-[10px] text-[13px]">
    <span><ReadyCount {lobby} suffix="{hostName} starts" /></span>
    <span class="text-text-dim">Ready resets after each game</span>
  </div>
</section>
```

- [ ] **Step 3: Start, open and the bar in `Lobby.svelte`.**
  - Imports:

    ```ts
    import ConfirmModal from '$lib/components/ConfirmModal.svelte'
    import GameRunningBar from '$lib/components/lobby/GameRunningBar.svelte'
    import NextGameCard from '$lib/components/lobby/NextGameCard.svelte'
    import MemberPanel from '$lib/components/lobby/MemberPanel.svelte'
    import { isHost, myRow, playsInGame, type LobbyPatch } from '$lib/lobby/rules'
    import { shouldOpenGame, startGame } from '$lib/lobby/start'
    ```

  - Merge them with the existing `$lib/lobby/rules` import.
  - Add to the script:

```ts
  const updateLobby = (patch: LobbyPatch) =>
    withLobby(id => api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: patch }))

  // Going to the game: once per game, for whoever has a seat in it (decision 7)
  let seenSession: string | null | undefined = undefined
  let opened: string | null = null
  function openGame(sessionId: string) {
    if (opened === sessionId) return
    opened = sessionId
    void push(`/session/${sessionId}`)
  }
  $effect(() => {
    if (!lobby) return
    const next = lobby.currentSessionId
    if (next !== null && shouldOpenGame(seenSession, next, playsInGame(lobby, viewerId))) openGame(next)
    seenSession = next
  })

  // Start or Rematch; people who aren't ready get named and the host can start anyway
  let confirmStart = $state<{ names: string[]; rematch: boolean } | null>(null)
  async function start(rematch: boolean, force = false) {
    const id = lobby?.id
    if (!id) return
    const outcome = await startGame(id, { rematch, force })
    if (outcome.kind === 'started') { error = ''; openGame(outcome.sessionId) }
    else if (outcome.kind === 'confirm') confirmStart = { names: outcome.notReady, rematch }
    else error = outcome.message
  }
  const host = $derived(lobby !== null && isHost(lobby, viewerId))
  const mine = $derived(lobby ? myRow(lobby, viewerId) : null)
```

  - Replace the `<!-- Task 10: … -->` comment with:

```svelte
          {#if l.currentSessionId}
            <GameRunningBar sessionId={l.currentSessionId} playing={playsInGame(l, viewerId)} />
          {/if}
          {#if host}
            <NextGameCard lobby={l} onupdate={updateLobby} onplays={(personId, plays) => updatePerson(personId, { plays })}
              onstart={(rematch) => void start(rematch)} />
          {:else if mine}
            <MemberPanel lobby={l} me={mine} onupdate={updatePerson} />
          {/if}
```

  - Append after `</Layout>`:

```svelte
{#if confirmStart}
  {@const cs = confirmStart}
  <ConfirmModal title="Start anyway?" body={`Not ready yet: ${cs.names.join(', ')}.`}
    confirmLabel="Start anyway" cancelLabel="Wait"
    onconfirm={() => { confirmStart = null; void start(cs.rematch, true) }} oncancel={() => confirmStart = null} />
{/if}
```

- [ ] **Step 4: Verify.**
  - `npm test` passes. `npm run typecheck`: 0 errors and 0 warnings. `npm run lint; echo $?`: 0.
  - In the browser, with Admin as host and Luke as a member:
    1. Set an X01 next game from Admin's devtools until Task 14 adds Play-page support: `fetch('/api/lobbies/<id>', {method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({nextGame:{gameId:'x01', config:{startScore:301, inMode:'straight', outMode:'double', bullOff:'off', bullValue:'25_50', maxRounds:50, firstTo:1}}})})`
    2. Luke's panel shows "301 · Double out · First to 1 leg". "Sitting this one out" turns his Ready into "not needed".
    3. Admin's Settings change the start score, and Luke sees it change at once.
    4. Admin starts with Luke not ready: the dialog names Luke, and "Start anyway" opens the game in both windows.
    5. Back on the lobby page, the bar shows "Back to game" and nobody is bounced to the game again.
    6. After the game, Rematch appears.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/lobby/rules.ts backend/frontend/src/lib/components/lobby backend/frontend/src/routes/Lobby.svelte
git commit -m "feat(frontend): next game, start and rematch from the lobby

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 11: The lobby indicator and the invite badge, live everywhere

Start the app's `/ws/me` once someone is signed in. Show the lobby indicator (`Lobby-Indicator`) as a card in the desktop side nav and as a strip above the phone tab bar. Put the number of pending invites as a badge on the phone's Play tab.

**Files:**
- Modify: `backend/frontend/src/lib/lobby/format.ts` (`indicatorView`), `lib/nav.ts` (`badge`)
- Test: `lib/__tests__/lobbyFormat.test.ts`, `lib/__tests__/nav.test.ts`
- Create: `backend/frontend/src/lib/components/LobbyIndicator.svelte`, `LobbyStrip.svelte`, `NavBadge.svelte`
- Modify: `backend/frontend/src/App.svelte`, `lib/components/SideNav.svelte`, `lib/components/TabBar.svelte`, `lib/components/Layout.svelte`

**Interfaces:**
- Consumes: `me` (Task 5), `LobbySummary.youHost` (Task 1), `gameName` (Task 2), Button (Task 7).
- Produces:
  ```ts
  export type IndicatorView = { tag: string; name: string; line: string; next: string; back: { sessionId: string; label: string } | null }
  export function indicatorView(s: LobbySummary): IndicatorView
  export function navTabs(liveSessionId: string | null, invites?: number): NavTab[]   // NavTab gains `badge?: number`
  NavBadge { count: number; label: string }   // the lime count bubble (tab bar, side nav)
  ```

- [ ] **Step 1: Write the failing tests.** In `lobbyFormat.test.ts` (import `indicatorView`):

```ts
describe('indicatorView', () => {
  const s = { id: 'l1', name: 'Friday darts', peopleCount: 6, nextGame: { gameId: 'x01', config: {} }, sessionId: null, gameId: null, youThrowNext: false, leg: null, youHost: false }

  it('a member waiting, the host', () => {
    expect(indicatorView(s)).toEqual({ tag: 'In lobby', name: 'Friday darts', line: '6 people · Next: X01', next: 'Next: X01', back: null })
    expect(indicatorView({ ...s, youHost: true }).tag).toBe('In lobby · Host')
    expect(indicatorView({ ...s, peopleCount: 1, nextGame: null })).toMatchObject({ line: '1 person · no game picked', next: 'no game picked' })
  })

  it('a game running: whose turn, and the way back with the leg', () => {
    const playing = { ...s, sessionId: 's1', gameId: 'x01', youThrowNext: true, leg: 1 }
    expect(indicatorView(playing)).toEqual({
      tag: 'In lobby · Playing', name: 'Friday darts', line: 'X01 · you throw next', next: 'you throw next',
      back: { sessionId: 's1', label: 'Back to game · Leg 2' },
    })
    expect(indicatorView({ ...playing, youThrowNext: false, gameId: 'atc', leg: null })).toMatchObject({
      line: 'Around the Clock · game running', back: { sessionId: 's1', label: 'Back to game' },
    })
  })
})
```

  In `nav.test.ts`, inside `describe('navTabs')`:

```ts
  it('puts the pending invites on the Play tab', () => {
    expect(navTabs(null, 2)[0]).toEqual({ href: '/', label: 'Play', icon: 'play', badge: 2 })
    expect(navTabs(null, 0)[0]).toEqual({ href: '/', label: 'Play', icon: 'play' })
  })
```

- [ ] **Step 2: Run them.** `npx vitest run src/lib/__tests__/lobbyFormat.test.ts src/lib/__tests__/nav.test.ts`. Expected: FAIL, because there's no `indicatorView` and no badge.

- [ ] **Step 3: Implement.** Append to `lib/lobby/format.ts`, adding `LobbySummary` to the type import:

```ts
/**
 * The lobby indicator (side nav card, phone strip). `line` is the card's full status line;
 * `next` is its last part, for the narrow phone strip.
 */
export type IndicatorView = { tag: string; name: string; line: string; next: string; back: { sessionId: string; label: string } | null }

export function indicatorView(s: LobbySummary): IndicatorView {
  const tag = s.sessionId ? 'In lobby · Playing' : s.youHost ? 'In lobby · Host' : 'In lobby'
  const next = s.sessionId
    ? (s.youThrowNext ? 'you throw next' : 'game running')
    : (s.nextGame ? `Next: ${gameName(s.nextGame.gameId)}` : 'no game picked')
  const first = s.sessionId ? gameName(s.gameId ?? '') : `${s.peopleCount} ${s.peopleCount === 1 ? 'person' : 'people'}`
  const back = s.sessionId
    ? { sessionId: s.sessionId, label: s.leg === null ? 'Back to game' : `Back to game · Leg ${s.leg + 1}` }
    : null
  return { tag, name: s.name, line: `${first} · ${next}`, next, back }
}
```

  In `lib/nav.ts`, add `badge?: number` to `NavTab`, and change `navTabs` to:

```ts
/** The phone tab bar: Live only while a game is running; pending invites as a badge on Play. */
export function navTabs(liveSessionId: string | null, invites = 0): NavTab[] {
  return [
    { href: '/', label: 'Play', icon: 'play', ...(invites > 0 ? { badge: invites } : {}) },
    ...(liveSessionId ? [{ href: `/session/${liveSessionId}`, label: 'Live', icon: 'live' as const }] : []),
    { href: '/boards', label: 'Boards', icon: 'boards' },
    { href: '/history', label: 'History', icon: 'history' },
  ]
}
```

  Run the tests again. Expected: PASS.

- [ ] **Step 4: The components.**

`lib/components/NavBadge.svelte`:

```svelte
<script lang="ts">
  // A small lime count (pending invites) on a tab or a nav link.
  let { count, label, class: className = '' }: { count: number; label: string; class?: string } = $props()
</script>

<span aria-label={label}
  class="h-[18px] min-w-[18px] box-border px-[5px] rounded-[9px] bg-accent text-accent-fg text-[11px] font-bold flex items-center justify-center {className}">{count}</span>
```

`lib/components/LobbyIndicator.svelte`:

```svelte
<script lang="ts">
  // The desktop side nav's lobby card. Create or Join while you're in no lobby; otherwise your
  // lobby, live (people, next game, whose turn), and the way back into a running game.
  import { ChevronRight, Plus } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'

  const view = $derived($me?.lobby ? indicatorView($me.lobby) : null)

  async function create() {
    // Already in one (say another tab made it): the lobby page shows that one
    await api.POST('/api/lobbies')
    void push('/lobby')
  }
</script>

{#if view}
  <div class="flex flex-col gap-2 p-3 rounded-[12px] border border-accent-line bg-surface-active">
    <a href="#/lobby" aria-label="You're in the lobby {view.name}. {view.line}. Open the lobby" class="flex flex-col gap-2 text-text no-underline">
      <span class="flex items-center justify-between">
        <span class="inline-flex items-center gap-[7px] text-[11px] font-bold tracking-[0.1em] uppercase text-accent">
          <span class="w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none"></span>{view.tag}
        </span>
        <ChevronRight size={16} class="text-text-muted" />
      </span>
      <span class="font-display font-bold text-[22px] leading-none uppercase tracking-[0.02em] truncate">{view.name}</span>
      <span class="text-[12px] text-text-muted truncate">{view.line}</span>
    </a>
    {#if view.back}<Button variant="accent" href="#/session/{view.back.sessionId}" class="h-[34px] text-[13px]">{view.back.label}</Button>{/if}
  </div>
{:else if $me}
  <div class="flex flex-col gap-[6px] p-[10px] rounded-[12px] border border-line bg-surface-1">
    <Button variant="outline" onclick={() => void create()} class="h-11 bg-surface-active border-accent-line text-accent font-semibold">
      <Plus size={16} strokeWidth={2.4} />Create lobby
    </Button>
    <span class="text-[12px] text-text-dim text-center">Have a code? <a href="#/join" class="font-semibold no-underline">Join a lobby</a></span>
  </div>
{/if}
```

`lib/components/LobbyStrip.svelte`:

```svelte
<script lang="ts">
  // Above the phone tab bar while you're in a lobby: its name and what's next, or during its
  // game the way back. Not on the lobby page itself.
  import { ChevronRight } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'

  const view = $derived($me?.lobby ? indicatorView($me.lobby) : null)
</script>

{#if view && $location !== '/lobby'}
  <a href={view.back ? `#/session/${view.back.sessionId}` : '#/lobby'} aria-label="You're in the lobby {view.name}. {view.line}"
    class="md:hidden shrink-0 flex items-center gap-[10px] h-12 px-4 bg-surface-active border-t border-accent-line text-text no-underline">
    <span class="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse motion-reduce:animate-none"></span>
    <span class="text-[14px] min-w-0 truncate"><span class="text-accent font-bold">{view.tag}</span> · <strong>{view.name}</strong></span>
    <span class="ml-auto text-[13px] text-text-muted shrink-0">{view.back ? view.back.label : view.next}</span>
    <ChevronRight size={16} class="text-text-muted shrink-0" />
  </a>
{/if}
```

- [ ] **Step 5: Wire it up.**
  - **`App.svelte`:** import `{ me }` from `'$lib/lobby/sockets'`, and below `onMount` add:

```ts
  // The per-user socket (invites, the lobby indicator) runs while someone is signed in
  $effect(() => {
    if ($currentUser) me.start()
    else me.stop()
  })
```

  - **`SideNav.svelte`:** import `LobbyIndicator from './LobbyIndicator.svelte'` and put `<LobbyIndicator />` first inside the `mt-auto flex flex-col gap-4` group.
  - **`TabBar.svelte`:**
    - Import `{ me }` from `'$lib/lobby/sockets'` and `NavBadge from './NavBadge.svelte'`.
    - Set `const tabs = $derived(navTabs($activeSessionId, $me?.invites.length ?? 0))`.
    - Inside the `<a>`, after the live dot:

```svelte
      {#if tab.badge}
        <NavBadge count={tab.badge} label="{tab.badge} pending {tab.badge === 1 ? 'invite' : 'invites'}"
          class="absolute top-[6px] left-1/2 ml-[4px] border-2 border-surface-1" />
      {/if}
```

  - **`Layout.svelte`:** import `LobbyStrip from './LobbyStrip.svelte'` and render `<LobbyStrip />` right before `<TabBar />`.

- [ ] **Step 6: Verify.**
  - `npm test` passes. `npm run typecheck` reports 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - In the browser:
    - With no lobby, the side nav shows "Create lobby / Join a lobby".
    - Create lobby lands on the lobby page, and the card becomes "In lobby · Host · 1 person · no game picked".
    - At 390 px wide, on another page, the strip shows above the tab bar.
    - Luke invites Admin into Luke's own lobby, and Admin's Play tab shows "1".

- [ ] **Step 7: Commit**

```bash
git add backend/frontend/src/lib/lobby/format.ts backend/frontend/src/lib/nav.ts backend/frontend/src/lib/__tests__ backend/frontend/src/lib/components backend/frontend/src/App.svelte
git commit -m "feat(frontend): lobby indicator and invite badge, live everywhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 12: Joining by code or link

The page at `#/join` and `#/join/:code` (`Lobby-Join`). The join link and the QR code open `#/join/<code>`.
- The page shows which lobby the code opens.
- Then "Join as <you>".
- Someone already in another lobby can leave it first.
- There's no in-app scanner.

**Files:**
- Create: `backend/frontend/src/lib/components/lobby/LobbyPreviewCard.svelte`
- Create: `backend/frontend/src/routes/Join.svelte`
- Modify: `backend/frontend/src/App.svelte` (routes `/join`, `/join/:code`)

**Interfaces:**
- Consumes:
  - from Task 4: `normalizeCode`, `describeConflict`, `Refusal` (it has `lobbyId`)
  - from Task 2: `formatCode`
  - from Task 5: `me`
  - from Task 7: Avatar, Button, SwitchLobbyConfirm
  - `signOut`
- Produces: `LobbyPreviewCard { name: string; hostName: string | null; boardNames: string[]; peopleCount: number }`

- [ ] **Step 1: The preview card.** `lobby/LobbyPreviewCard.svelte`:

```svelte
<script lang="ts">
  // Which lobby a code opens (Lobby-Join): its name, host, boards and how many are in.
  import Avatar from './Avatar.svelte'

  let { name, hostName, boardNames, peopleCount }: { name: string; hostName: string | null; boardNames: string[]; peopleCount: number } = $props()
  const line = $derived([
    hostName ? `${hostName}'s lobby` : 'Lobby',
    ...(boardNames.length ? [boardNames.join(', ')] : []),
    `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`,
  ].join(' · '))
</script>

<div class="flex items-center gap-3 p-[14px] rounded-[12px] bg-surface-active border border-line-2">
  <Avatar name={hostName ?? name} size={40} />
  <div class="flex flex-col gap-[2px] min-w-0">
    <span class="text-[16px] font-semibold truncate">{name}</span>
    <span class="text-[13px] text-text-muted truncate">{line}</span>
  </div>
</div>
```

- [ ] **Step 2: The page.** `backend/frontend/src/routes/Join.svelte`:

```svelte
<script lang="ts">
  // Joining a lobby by its code: typed, or from a join link or QR code (#/join/K7Q4MD). It shows
  // which lobby the code opens first; someone in another lobby can leave it first.
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import LobbyPreviewCard from '$lib/components/lobby/LobbyPreviewCard.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import { api } from '$lib/api'
  import { currentUser, signOut } from '$lib/auth'
  import { formatCode } from '$lib/lobby/format'
  import { describeConflict, normalizeCode, type Refusal } from '$lib/lobby/input'
  import { me } from '$lib/lobby/sockets'

  type Preview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
  let { params = {} }: { params?: { code?: string } } = $props()

  // Filled from the link once; typing changes it from there
  let text = $state(formatCode(normalizeCode(params.code ?? '')))
  const code = $derived(normalizeCode(text))
  let preview = $state<Preview | null>(null)
  let missing = $state(false)
  let error = $state('')
  let busy = $state(false)
  let leaveFirst = $state<string | null>(null)
  const you = $derived($currentUser?.name ?? 'you')

  $effect(() => {
    const c = code
    preview = null
    missing = false
    if (c.length !== 6) return
    api.GET('/api/lobby-codes/{code}', { params: { path: { code: c } } })
      .then(({ data }) => { if (code === c) { preview = data ?? null; missing = !data } })
      .catch(() => { if (code === c) missing = true })
  })

  async function join() {
    if (!preview) return
    busy = true
    error = ''
    try {
      const res = await api.POST('/api/lobbies/{id}/join', { params: { path: { id: preview.id } }, body: { code } })
      if (res.data) { void push('/lobby'); return }
      const r: Refusal = res.error
      if (r.code === 'in_lobby' && r.lobbyId && r.lobbyId !== preview.id) leaveFirst = r.lobbyId
      else error = describeConflict(r)
    } finally { busy = false }
  }

  async function leaveAndJoin() {
    const current = leaveFirst
    leaveFirst = null
    if (!current) return
    await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: current } } })
    await join()
  }
</script>

<Layout title="Join lobby">
  <main class="flex flex-grow flex-col gap-[22px] box-border w-full max-w-[480px] min-w-0 overflow-y-auto px-5 py-7 md:px-11 md:py-10">
    <div class="flex flex-col gap-2">
      <h2 class="m-0 font-display font-bold text-[34px] leading-none uppercase">Enter the lobby code</h2>
      <p class="m-0 text-[15px] leading-[1.45] text-text-muted">The host sees it at the top of their lobby screen.</p>
    </div>
    <div class="flex flex-col gap-2">
      <label for="lobby-code" class="text-[14px] font-medium text-ink-soft">Lobby code</label>
      <input id="lobby-code" bind:value={text} autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"
        placeholder="K7Q4-MD" maxlength="12"
        class="h-[60px] box-border px-4 bg-surface-2 border-2 rounded-[12px] text-text font-mono text-[26px] tracking-[0.16em] text-center uppercase
               {missing ? 'border-live' : 'border-accent'}" />
      {#if missing}<span class="text-[13px] text-live-text">No open lobby with that code. Check it with the host.</span>{/if}
    </div>
    {#if preview}<LobbyPreviewCard name={preview.name} hostName={preview.hostName} boardNames={preview.boardNames} peopleCount={preview.peopleCount} />{/if}
    <p class="m-0 text-[13px] text-text-dim">Or point your phone's camera at the QR code on the host's lobby screen.</p>
    {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
    <Button class="mt-auto h-14" disabled={!preview || busy} onclick={() => void join()}>{busy ? 'Joining…' : `Join as ${you}`}</Button>
    <p class="m-0 text-[13px] text-center text-text-muted">
      Not {you}? <button type="button" onclick={() => void signOut()} class="p-0 border-0 bg-transparent text-accent font-semibold cursor-pointer font-[inherit]">Switch account</button>
    </p>
  </main>
</Layout>

{#if leaveFirst && preview}
  <SwitchLobbyConfirm from={$me?.lobby?.name ?? 'your lobby'} to={preview.name}
    onconfirm={() => void leaveAndJoin()} oncancel={() => leaveFirst = null} />
{/if}
```


  In `App.svelte`, import `Join from './routes/Join.svelte'` and add `'/join': Join,` and `'/join/:code': Join,`.

- [ ] **Step 3: Verify.**
  - `npm test` passes. `npm run typecheck` reports 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - With Admin hosting:
    - Luke opens `#/join` and types `k7q4 md`: the preview shows Admin's lobby. "Join as Luke" lands in the lobby.
    - A wrong code shows "No open lobby with that code".
    - Luke, while in Phil's lobby, opens Admin's link: "Leave and join" moves him.

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/lib/components/lobby/LobbyPreviewCard.svelte backend/frontend/src/routes/Join.svelte backend/frontend/src/App.svelte
git commit -m "feat(frontend): join a lobby by code or link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 13: Invites

The page at `#/invites` (`Invites-Phone`), live from `/ws/me`.
- Accepting while in another lobby asks to leave that one first; your guests leave with you.
- Desktop: the side nav gets an "Invites" link with the count (decision 4).
- Phones: the Play tab badge (Task 11) and the Play page banner (Task 14) lead here.

**Files:**
- Modify: `backend/frontend/src/lib/lobby/format.ts` (`inviteTime`)
- Test: `backend/frontend/src/lib/__tests__/lobbyFormat.test.ts`
- Create: `backend/frontend/src/lib/components/lobby/InviteCard.svelte`, `backend/frontend/src/routes/Invites.svelte`
- Modify: `backend/frontend/src/App.svelte` (route `/invites`), `lib/components/SideNav.svelte`

**Interfaces:**
- Consumes: EmptyState, Avatar, Button, SwitchLobbyConfirm (Task 7); NavBadge (Task 11); `me`; `describeConflict`, `Refusal`.
- Produces:
  - `inviteTime(at: string, now: Date): string`
  - `InviteCard { invite: PendingInvite; now: Date; onaccept: () => void; ondecline: () => void }`

- [ ] **Step 1: Write the failing test** in `lobbyFormat.test.ts` (import `inviteTime`):

```ts
describe('inviteTime', () => {
  const now = new Date(2026, 9, 3, 21, 30)
  it('says how long ago, then the day and time', () => {
    expect(inviteTime(new Date(2026, 9, 3, 21, 29, 40).toISOString(), now)).toBe('just now')
    expect(inviteTime(new Date(2026, 9, 3, 21, 28).toISOString(), now)).toBe('2 min ago')
    expect(inviteTime(new Date(2026, 9, 3, 18, 5).toISOString(), now)).toBe('Today, 18:05')
    expect(inviteTime(new Date(2026, 9, 2, 18, 40).toISOString(), now)).toBe('Yesterday, 18:40')
    expect(inviteTime(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe('28 Sep, 09:00')
  })
})
```

- [ ] **Step 2: Run it.** Expected: FAIL, `inviteTime` isn't exported.

- [ ] **Step 3: Implement.** Append to `lib/lobby/format.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** When an invite came: "just now", "2 min ago", "Today, 18:05", "Yesterday, 18:40", "28 Sep, 09:00". */
export function inviteTime(at: string, now: Date): string {
  const d = new Date(at)
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const time = feedTime(at)
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`
}
```

  Run the test. Expected: PASS.

- [ ] **Step 4: The card and the page.**

`lobby/InviteCard.svelte`:

```svelte
<script lang="ts">
  // One pending invite (Invites-Phone): the lobby, who invited you and when, Decline and Accept.
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import Avatar from './Avatar.svelte'
  import { inviteTime } from '$lib/lobby/format'

  let { invite, now, onaccept, ondecline }: { invite: PendingInvite; now: Date; onaccept: () => void; ondecline: () => void } = $props()
</script>

<li class="flex flex-col gap-3 p-[14px] rounded-[14px] bg-surface-panel border border-line-2">
  <div class="flex items-center gap-3">
    <Avatar name={invite.inviterName ?? invite.lobbyName} size={40} />
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[17px] font-semibold truncate">{invite.lobbyName}</span>
      <span class="text-[13px] text-text-muted truncate">{invite.inviterName ? `Invited by ${invite.inviterName}` : 'Invited'}</span>
    </div>
    <span class="text-[12px] text-text-dim shrink-0">{inviteTime(invite.createdAt, now)}</span>
  </div>
  <div class="grid grid-cols-2 gap-2">
    <Button variant="outline" class="h-[46px] font-semibold text-[15px]" aria-label="Decline the invite to {invite.lobbyName}" onclick={ondecline}>Decline</Button>
    <Button variant="accent" class="h-[46px]" aria-label="Accept the invite to {invite.lobbyName}" onclick={onaccept}>Accept</Button>
  </div>
</li>
```

`backend/frontend/src/routes/Invites.svelte`:

```svelte
<script lang="ts">
  // Your pending invites, live from /ws/me. Accepting while you're in another lobby asks you
  // to leave it first (your guests leave with you).
  import { Mail } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'
  import InviteCard from '$lib/components/lobby/InviteCard.svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import { api } from '$lib/api'
  import type { PendingInvite } from '$lib/api/lobby-ws'
  import { describeConflict, type Refusal } from '$lib/lobby/input'
  import { me } from '$lib/lobby/sockets'

  const invites = $derived($me?.invites ?? [])
  const now = new Date()
  let error = $state('')
  let switching = $state<{ invite: PendingInvite; from: string } | null>(null)

  async function accept(inv: PendingInvite) {
    error = ''
    const res = await api.POST('/api/invites/{id}/accept', { params: { path: { id: inv.id } } })
    if (res.data) { void push('/lobby'); return }
    const r: Refusal = res.error
    if (r.code === 'in_lobby' && r.lobbyId) switching = { invite: inv, from: r.lobbyId }
    else error = describeConflict(r)
  }

  async function leaveAndAccept() {
    const s = switching
    switching = null
    if (!s) return
    await api.POST('/api/lobbies/{id}/leave', { params: { path: { id: s.from } } })
    await accept(s.invite)
  }

  async function decline(inv: PendingInvite) {
    const res = await api.POST('/api/invites/{id}/decline', { params: { path: { id: inv.id } } })
    error = res.error ? describeConflict(res.error) : ''
  }
</script>

<Layout title="Invites">
  <main class="flex flex-grow flex-col gap-3 box-border w-full max-w-[560px] min-w-0 overflow-y-auto p-4 md:px-11 md:py-10">
    <h2 class="hidden md:block m-0 font-display font-bold text-[48px] leading-none uppercase">Invites</h2>
    {#if error}<p role="alert" class="m-0 text-[14px] text-live-text">{error}</p>{/if}
    {#if invites.length === 0}
      <EmptyState title="No pending invites" text="When a friend adds you to their lobby with your @username, it shows up here.">
        {#snippet icon()}<Mail size={24} />{/snippet}
      </EmptyState>
    {:else}
      <ol class="m-0 p-0 list-none flex flex-col gap-[10px]">
        {#each invites as inv (inv.id)}
          <InviteCard invite={inv} {now} onaccept={() => void accept(inv)} ondecline={() => void decline(inv)} />
        {/each}
      </ol>
      <span class="text-[13px] text-text-dim">Accepting puts you on your usual board; you can change it in the lobby.</span>
    {/if}
  </main>
</Layout>

{#if switching}
  {@const s = switching}
  <SwitchLobbyConfirm from={$me?.lobby?.name ?? 'your lobby'} to={s.invite.lobbyName}
    onconfirm={() => void leaveAndAccept()} oncancel={() => switching = null} />
{/if}
```

  - In `App.svelte`, import `Invites from './routes/Invites.svelte'` and add `'/invites': Invites`.
  - In `SideNav.svelte`:
    - Import `Mail` from `@lucide/svelte`, `{ me }` from `'$lib/lobby/sockets'` and `NavBadge from './NavBadge.svelte'`.
    - Add `const inviteCount = $derived($me?.invites.length ?? 0)`.
    - After the `{#each links …}` block (inside the links `div`), add:

```svelte
    {#if inviteCount > 0}
      {@const active = isActive('/invites')}
      <a href="#/invites" aria-current={active ? 'page' : undefined}
        class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px]
               {active ? 'bg-[#22251f] text-text font-semibold' : 'text-[#c9c9bf] font-medium'}">
        <Mail size={20} strokeWidth={1.8} />Invites
        <NavBadge count={inviteCount} label="{inviteCount} pending" class="ml-auto" />
      </a>
    {/if}
```

- [ ] **Step 5: Verify.**
  - `npm test` passes. `npm run typecheck` reports 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - Phil's lobby invites `@admin`:
    - Admin's side nav shows "Invites 1".
    - The page lists it as "Invited by Phil · just now".
    - Decline removes it live.
  - Phil invites Admin again while Admin is in a lobby of their own:
    - Accept asks "Leave … to join …?".
    - "Leave and join" lands in Phil's lobby.

- [ ] **Step 6: Commit**

```bash
git add backend/frontend/src/lib/lobby/format.ts backend/frontend/src/lib/__tests__/lobbyFormat.test.ts backend/frontend/src/lib/components/lobby/InviteCard.svelte backend/frontend/src/routes/Invites.svelte backend/frontend/src/App.svelte backend/frontend/src/lib/components/SideNav.svelte
git commit -m "feat(frontend): invites: accept, decline, switch lobbies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 14: The Play page inside a lobby

Spec ("New game inside a lobby") and `Play`, `Mobile-Play`:
- **The players card:** inside a lobby, the player list becomes "From your lobby · N playing · Manage", which opens the lobby. The board selector goes away (boards are per person in a lobby).
- **The host's "Game on":** saves the picked mode and settings as the lobby's next game, then starts it with the soft ready gate.
- **Members:** they see "<host> starts the game" (decision 5).
- **Outside a lobby:** a "Play with friends" row offers Create lobby and Join.
- **Invites:** pending invites show as a banner at the top.
- **Steppers:** the page's two inline −/+ steppers (max rounds, first to) become the shared `Stepper`.

**Files:**
- Create in `lib/components/lobby/`: `LobbyPlayersCard.svelte`, `PlayWithFriends.svelte`, `InvitesBanner.svelte`
- Modify: `backend/frontend/src/routes/CreateSession.svelte`

**Interfaces:**
- Consumes:
  - `me`, `createLobbyStore` (Task 5)
  - `startGame` (Task 6)
  - `describeConflict` (Task 4)
  - `counts`, `isHost` (Task 3)
  - Avatar, Button, Stepper (Task 7)
- Produces:
  - `LobbyPlayersCard { lobby: Lobby }`
  - `PlayWithFriends {}`
  - `InvitesBanner { count: number }`

- [ ] **Step 1: The components.**

`lobby/LobbyPlayersCard.svelte`:

```svelte
<script lang="ts">
  // The Play page inside a lobby (Play, Mobile-Play): the lobby's players instead of the
  // player list. Manage opens the lobby.
  import type { Lobby } from '$lib/api/lobby-ws'
  import Avatar from './Avatar.svelte'
  import { counts } from '$lib/lobby/rules'

  let { lobby }: { lobby: Lobby } = $props()
  const ORDER: Record<Lobby['throwOrder'], string> = { lobby: 'lobby order', random: 'random order', bulloff: 'bull-off decides' }
  const c = $derived(counts(lobby))
  const playing = $derived(lobby.people.filter(p => p.plays))
  const out = $derived(lobby.people.filter(p => !p.plays).map(p => p.name))
  const line = $derived([
    ...(out.length ? [`${out.join(', ')} ${out.length === 1 ? 'sits' : 'sit'} out`] : []),
    ORDER[lobby.throwOrder],
  ].join(' · '))
</script>

<div class="flex flex-col gap-2 pt-[18px] border-t border-line">
  <div class="flex justify-between items-baseline">
    <span class="text-[14px] font-medium text-ink-soft">Players</span>
    <span class="text-[12px] text-text-dim">From your lobby</span>
  </div>
  <a href="#/lobby" class="flex items-center gap-[10px] min-h-[58px] px-3 rounded-[10px] bg-surface-active border border-accent-line text-text no-underline">
    <span class="flex items-center pl-[6px] shrink-0">
      {#each playing.slice(0, 4) as p (p.id)}
        <span class="-ml-[6px] rounded-full ring-2 ring-surface-active"><Avatar name={p.name} guest={p.userId === null} size={30} /></span>
      {/each}
    </span>
    <span class="flex flex-col gap-px min-w-0 flex-grow">
      <span class="text-[14px] font-semibold truncate">{lobby.name} · {c.playing} playing</span>
      <span class="text-[12px] text-text-muted truncate">{line}</span>
    </span>
    <span class="text-[13px] font-semibold text-accent shrink-0">Manage</span>
  </a>
</div>
```

`lobby/PlayWithFriends.svelte`:

```svelte
<script lang="ts">
  // Under the player list while you're in no lobby: start one, or join with a code.
  import { push } from 'svelte-spa-router'
  import { api } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'

  async function create() {
    await api.POST('/api/lobbies')
    void push('/lobby')
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[10px] border border-dashed border-line-dashed">
  <span class="text-[13px] text-text-muted">Friends on their own boards or phones?</span>
  <span class="flex gap-2">
    <Button variant="outline" class="h-9 font-semibold" onclick={() => void create()}>Create lobby</Button>
    <Button variant="ghost" href="#/join" class="h-9">Join</Button>
  </span>
</div>
```

`lobby/InvitesBanner.svelte`:

```svelte
<script lang="ts">
  // Pending invites at the top of the Play page; opens them.
  import { ChevronRight, Mail } from '@lucide/svelte'

  let { count }: { count: number } = $props()
</script>

<a href="#/invites" class="flex items-center gap-3 h-12 px-4 rounded-[12px] bg-surface-active border border-accent-line text-text no-underline">
  <Mail size={18} class="text-accent" />
  <span class="text-[14px]"><strong>{count} {count === 1 ? 'invite' : 'invites'}</strong> <span class="text-text-muted">to a lobby</span></span>
  <ChevronRight size={16} class="ml-auto text-text-muted" />
</a>
```

- [ ] **Step 2: `CreateSession.svelte`, the script.**
  - Add the imports:

    ```ts
    import Stepper from '$lib/components/Stepper.svelte'
    import ConfirmModal from '$lib/components/ConfirmModal.svelte'
    import LobbyPlayersCard from '$lib/components/lobby/LobbyPlayersCard.svelte'
    import PlayWithFriends from '$lib/components/lobby/PlayWithFriends.svelte'
    import InvitesBanner from '$lib/components/lobby/InvitesBanner.svelte'
    import type { Lobby } from '$lib/api/lobby-ws'
    import { currentUser } from '$lib/auth'
    import { describeConflict } from '$lib/lobby/input'
    import { counts, isHost } from '$lib/lobby/rules'
    import { createLobbyStore, me } from '$lib/lobby/sockets'
    import { startGame } from '$lib/lobby/start'
    ```

  - `currentUser` joins the existing `authClient` import from `$lib/auth`.
  - Then:

```ts
  // Inside a lobby, "Game on" starts the lobby's game with its players (spec: New game inside a lobby)
  let lobby = $state<Lobby | null>(null)
  $effect(() => {
    const id = $me?.lobby?.id
    if (!id) { lobby = null; return }
    const store = createLobbyStore(id)
    const unsub = store.lobby.subscribe(l => { lobby = l })
    return () => { unsub(); store.destroy() }
  })
  const lobbyHost = $derived(lobby !== null && isHost(lobby, $currentUser?.id ?? null))
  const hostName = $derived(lobby?.people.find(p => p.userId !== null && p.userId === lobby?.hostUserId)?.name ?? 'The host')
  const invites = $derived($me?.invites.length ?? 0)
  let confirmNames = $state<string[] | null>(null)
```

  - Change `playerCount` so a lobby counts its players:

```ts
  const playerCount = $derived(lobby ? counts(lobby).playing : 1 + guests.filter(g => g.account || g.name.trim()).length)
```

  - Move the mode-to-API part of `start()` into a function both starts use, and make `start()` use it:

```ts
  /** The picked mode and settings as the API takes them; null (with the error shown) if the backend has no such game. */
  function chosenGame(): { gameId: string; config: Record<string, unknown> } | null {
    const gameId = games.find(g => g.id === selectedMode)?.id
      ?? games.find(g => g.id.includes('501'))?.id
      ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return null }
    const settings = selectedMode === 'atc'
      ? { finishOn: config.finishOn, order: config.order, multiplierAdvances: config.multiplierAdvances, throwAgainOnAllHit: config.throwAgainOnAllHit }
      : { startScore: config.startScore, inMode: config.inMode, outMode: config.outMode, bullOff: config.bullOff, bullValue: config.bullValue, maxRounds: config.maxRounds, firstTo: config.firstTo }
    return { gameId, config: settings }
  }
```

  - Then in `start()`, replace the `gameId` and `resolvedConfig` lines with `const picked = chosenGame(); if (!picked) return` and send `body: { boardId: boardId || null, gameId: picked.gameId, config: picked.config, players: allPlayers }`.
  - Add:

```ts
  async function startInLobby(force = false) {
    if (!lobby) return
    const id = lobby.id
    error = ''
    runningSessionId = null
    const picked = chosenGame()
    if (!picked) return
    loading = true
    try {
      // Confirming "start anyway" repeats only the start: the next game is already saved
      if (!force) {
        const set = await api.PATCH('/api/lobbies/{id}', { params: { path: { id } }, body: { nextGame: picked } })
        if (set.error) { error = describeConflict(set.error); return }
      }
      const outcome = await startGame(id, { force })
      if (outcome.kind === 'started') { void activeSessionId.refresh(); void push(`/session/${outcome.sessionId}`) }
      else if (outcome.kind === 'confirm') confirmNames = outcome.notReady
      else { error = outcome.message; runningSessionId = outcome.sessionId }
    } finally { loading = false }
  }
```

- [ ] **Step 3: `CreateSession.svelte`, the markup.**
  - **Board selector:** in both places (the phone `headerAction` snippet and the desktop header), wrap `<BoardSelector …/>` in `{#if !lobby}…{/if}`.
  - **Invites banner:** as the first child of `<main>`, add:

```svelte
    {#if invites > 0}<InvitesBanner count={invites} />{/if}
```

  - **Steppers:** replace the "Max rounds" `div` (the one with the −/+ buttons) with:

```svelte
            <div class="flex justify-between items-center">
              <span class="flex items-center gap-2 text-[14px] font-medium text-[#d8d8ce]">Max rounds <Tooltip text="Maximum number of rounds before the game ends. The player with the lowest score wins if nobody checks out. Set higher for longer games." /></span>
              <Stepper value={num(config.maxRounds, 50)} label="rounds" highlight={isNonDefault('maxRounds')}
                onchange={(n) => config = { ...config, maxRounds: n }} />
            </div>
```

    Replace the "First to" `div` with:

```svelte
            <div class="flex justify-between items-center">
              <span class="text-[14px] font-medium text-[#d8d8ce]">First to</span>
              <Stepper value={num(config.firstTo, 3)} label="legs" unit={(n) => (n === 1 ? 'leg' : 'legs')} highlight={isNonDefault('firstTo')}
                onchange={(n) => config = { ...config, firstTo: n }} />
            </div>
```

  - **Players:** wrap the Players block (from `<!-- Players -->` through the "Add player" button's closing `</div>`) like this:

```svelte
        {#if lobby}
          <LobbyPlayersCard {lobby} />
        {:else}
          <!-- the existing Players block, unchanged -->
          <PlayWithFriends />
        {/if}
```

  - **Start:** replace the "Game on" `<button …>…</button>` with:

```svelte
          {#if lobby && !lobbyHost}
            <p class="m-0 h-12 md:h-14 flex items-center justify-center text-[15px] text-text-muted">{hostName} starts the game</p>
          {:else}
            <button type="button" onclick={() => { if (lobby) void startInLobby(); else void start() }} disabled={loading || bullOffBlocked}
              title={bullOffBlocked ? 'Bull off needs at least two players' : undefined}
              class="h-12 md:h-14 flex items-center justify-center gap-[10px] bg-accent text-accent-fg
                     rounded-[10px] font-display font-bold text-[20px] md:text-[22px] tracking-[0.08em] uppercase
                     border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Starting…' : 'Game on'}
              {#if !loading}<ArrowRight size={20} strokeWidth={2.2} />{/if}
            </button>
          {/if}
```

  - **Confirm dialog:** after `</Layout>`, add:

```svelte
{#if confirmNames}
  {@const names = confirmNames}
  <ConfirmModal title="Start anyway?" body={`Not ready yet: ${names.join(', ')}.`} confirmLabel="Start anyway" cancelLabel="Wait"
    onconfirm={() => { confirmNames = null; void startInLobby(true) }} oncancel={() => confirmNames = null} />
{/if}
```

- [ ] **Step 4: Verify.**
  - `npm test` passes. `npm run typecheck` gives 0 errors and 0 warnings. `npm run lint; echo $?` prints 0.
  - **Outside a lobby, the Play page is unchanged apart from:**
    - the "Play with friends" row
    - the steppers: they look and work as before (try −/+ on Max rounds and First to)
  - **In a lobby, as host:**
    - The players card shows the lobby, and the board selector is gone.
    - Pick X01 301 and press "Game on". The lobby's next game becomes 301, and the "Start anyway?" dialog names whoever isn't ready. Confirming starts the game.
  - **As a member:** "Christoph starts the game", with no button.
  - **With a pending invite:** the banner shows and opens Invites.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/components/lobby backend/frontend/src/routes/CreateSession.svelte
git commit -m "feat(frontend): start lobby games from the Play page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 15: Spec and agent notes as built

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: The spec.** Append a section at the end:

```markdown
## Lobby screens, as built (plan 3, 2026-10-03)

- **Routes:** `#/lobby` (your lobby, or Create/Join), `#/join` and `#/join/:code` (the join
  link and the QR code open the latter), `#/invites`.
- **Live state:** the lobby page listens on `/ws/lobby`. The whole app keeps one `/ws/me` while
  you're signed in, for the indicator (desktop side nav card, phone strip above the tab bar) and
  the invite badge (phone Play tab; desktop "Invites" link). The summary says whether you're the
  host (`youHost`).
- **Controls:** the screens show only what the server would accept (`lib/lobby/rules.ts`
  mirrors `backend/src/lobby/rules.ts`). The board menu lists Manual and your own boards.
- **Who plays:** the host sits people out with the chips on the next-game card; everyone switches
  "In" / "Sits out" and Ready on their own rows (you and your guests).
- **Inline settings:** X01 only (start score 301/501/701, check-out, first to); "Change game"
  opens the Play page, where the host's "Game on" saves the next game and starts it. Members
  see "<host> starts the game" there.
- **Starting:** whoever has a seat goes to the game when it starts; a "Game running" bar leads
  back. A start with people not ready asks "Start anyway?".
- **Lobby closed or left:** the lobby page says so (no toast); the indicator just disappears.
- **Invites:** show the lobby, who invited you and when (the API has no boards or people for an
  invite). Accepting or joining while in another lobby asks to leave it first.
- **Not built:** the tablet rail (no tablet layout), friends chips (#54), an in-app QR scanner.
```

- [ ] **Step 2: `AGENTS.md`.** Add to the "Where to look" table, after the lobbies rows:

```
| Lobby screens (lobby, join, invites, indicator) | `backend/frontend/src/routes/{Lobby,Join,Invites}.svelte`; pieces in `lib/components/lobby/`; logic in `lib/lobby/` (`rules.ts` mirrors the server's rules, `sockets.ts` has `/ws/lobby` and the app-wide `/ws/me`, `start.ts` the soft ready gate) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-02-online-multiplayer-design.md AGENTS.md
git commit -m "docs: lobby screens as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 16: Visual pass with screenshots (controller), then the PR

The controller does this task, not an implementer subagent. The user asked for a PR with screenshots.

**Setup:**
- Point the dev stack at the branch: `git -C ~/Dev/dartcade checkout --detach feat/lobby-ui`, then restart the backend container.
- Dev logins: Admin as host, Luke as a member (the "Dev: switch to" buttons).
- In a lobby, add a guest and set an X01 next game.
- Check each screen against its artboard at 1440×900 and 390×844, in two frames or two windows.

- [ ] **Step 1: Walk the flows and look.**
  1. Create a lobby, then rename it.
  2. Copy the link and show the QR code.
  3. Luke joins with the code typed loosely.
  4. Move Luke onto Admin's board. Luke takes himself back to manual entry.
  5. Ready and In/Out on your own rows.
  6. Reorder and remove someone.
  7. Add a guest and invite `@phil`: Phil sees the badge, the side nav link and the invite card.
  8. "Start anyway" with someone not ready: everyone with a seat lands in the game. The indicator shows "you throw next · Leg 1", and the "Game running" bar shows in the lobby.
  9. Rematch after the game.
  10. Close the lobby: Luke's page says it was closed.
  11. The Play page in a lobby: the host's "Game on" and the member's "<host> starts the game".
  12. Steppers outside a lobby: unchanged.

  Send whatever looks wrong back to the task that owns it, as a fix round.

- [ ] **Step 2: Screenshots.**
  - Save each one to `docs/lobby/` in the repo (the repo already keeps PNGs under `docs/board-pairing/`):
    - `lobby-host-desktop.png` (1440 wide)
    - `lobby-host-phone.png`, `lobby-member-phone.png`
    - `join-phone.png`, `invites-phone.png`
    - `indicator-desktop.png`
    - `play-in-lobby-phone.png`
    - `start-anyway.png`
  - Crop each to its frame.
  - Commit: `docs: lobby screen screenshots`.

- [ ] **Step 3: Restore the dev stack.** `git -C ~/Dev/dartcade checkout main`, restart the backend, and delete the test lobbies' rows if they get in the way.

- [ ] **Step 4: Finish.** Run the final whole-branch review (superpowers:subagent-driven-development), and fix what it finds in the commits they belong to. Then:
  - Rebase onto `main`.
  - Push.
  - Open the PR. The body summarizes the screens, decisions and testing, and embeds the screenshots: `![Lobby, host, desktop](https://github.com/W3D3/dartcade/blob/<screenshot commit sha>/docs/lobby/lobby-host-desktop.png?raw=true)`, one per file.

---

## Self-review

**Spec coverage** ("Frontend", the canvas list, and "Update after the lobby designs"):

| Requirement | Task |
|---|---|
| People table: board chips, "Moved by you · usually X", ready for your own rows, read-only for others, row menu (Move up/down, Remove) | 8, 9 (`personLine`, BoardChip, PersonControls, RowMenu) |
| "Add someone: name or @username" (guest or invite) | 4 (`parseAddInput`), 9 (AddSomeone) |
| Next-game card with inline settings, Who plays chips, throw order, Start · N, the soft ready gate, Rematch | 6, 10 |
| Lobby history | 2 (`activityLine`), 8 (ActivityFeed) |
| Member view on a phone with a separate Ready, own board, guests and invites | 9, 10 (MemberPanel) |
| Join by code or link (`#/join`, `#/join/:code`), preview, leave-first | 4, 12 |
| Lobby indicator: side nav card, phone strip, live, "you throw next · Leg 2", host tag | 1, 11 |
| Invites with a live badge, accept, decline, leave-first | 11, 13 |
| Play page: "From your lobby · Manage", host's "Game on" | 14 |
| QR code of the join link (no in-app scanner) | 8 |
| The host regenerates the code | 8 |
| Presence, board offline | 7 (Avatar dot), 8 (BoardLabel) |
| Live per-user updates (`/ws/me`) | 5, 11 |
| Desktop and phone | every screen task; Task 16 checks both sizes |

Out of scope: the leave and end-of-game flows (plan 4), friends (#54), the tablet rail.

**Placeholder scan:** done.
- Every code step has its code.
- One instruction is conditional on purpose: Task 8's `uqr` version check. It names what to look for and what to do.

**Type consistency, checked across tasks:**
- `Refusal` (Task 4) includes `sessionId` and `lobbyId`; Tasks 6, 12 and 13 use both.
- `PersonPatch` (Task 9) and `LobbyPatch` (Task 10) are generated request types re-exported from `lib/lobby/rules.ts`.
- `PeopleList` snippets are `boardOf(p)` and `controlsOf(p, i)`. `PopoverMenu`'s children get `close`.
- `Lobby.svelte` keeps `act`, `withLobby`, `open`, `ownBoards` and `viewerId` from Task 8 on. From Task 9 on, snippets use `l` (from `{@const l = lobby}`).
- `IndicatorView` has `tag`, `name`, `line`, `next` and `back`.
- `shouldOpenGame(prev, next, playing)` is the same in Task 6 and Task 10.

**Review Focus:** each of the five items has its test or verify step in the task named next to it.

