import { refoldVisit } from './refold.js'
import { manualDart } from './manualDart.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Session, UserAction } from './types.js'

/** One input to a game: a board event or a user action. */
export type GameInput =
  | { source: 'board'; event: BoardEvent }
  | { source: 'user'; action: UserAction }

export type ApplyOutcome = {
  /** The visit this input committed, if any. */
  committed: CommittedVisit<unknown> | null
  /** The input decided the game. */
  won: boolean
}

const NONE: ApplyOutcome = { committed: null, won: false }

type DartEvent = Extract<BoardEvent, { kind: 'dart.detected' }>
const isDart = (e: BoardEvent): e is DartEvent => e.kind === 'dart.detected'
const dartEvents = (session: Session): DartEvent[] => session.openVisitEvents.filter(isDart)

/** Darts and visits of a bull off (see withBullOff) don't count towards game stats. */
export function inBullOff(session: Session, state: unknown): boolean {
  const view = session.module.view(state, session.players)
  return 'phase' in view && view.phase === 'bulloff'
}

export function hasWinner(session: Session, state: unknown): boolean {
  return session.module.view(state, session.players).winner !== null
}

// Adds `delta` darts to the thrower in `state`, unless that's the bull off
function countDarts(session: Session, state: unknown, delta: number): void {
  if (inBullOff(session, state)) return
  const thrower = session.module.getCurrentPlayer(state)
  session.totalDarts[thrower] = Math.max(0, (session.totalDarts[thrower] ?? 0) + delta)
}

function markCorrected(session: Session, dartPos: number): void {
  session.openDarts = session.openDarts.map((m, i) => i === dartPos ? { ...m, corrected: true } : m)
}

/**
 * Applies one input to a session: the only place a game's state changes. Live play and
 * replays of the input log both go through here, so they can't drift apart. `at` is when
 * the input happened (now, or the log entry's time). No I/O.
 */
export function applyInput(session: Session, input: GameInput, at: Date): ApplyOutcome {
  const outcome = input.source === 'board'
    ? applyBoardEvent(session, input.event, at)
    : applyUserAction(session, input.action, at)
  session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
  return outcome
}

function applyBoardEvent(session: Session, event: BoardEvent, at: Date): ApplyOutcome {
  switch (event.kind) {
    case 'visit.opened':
      session.openVisitEvents.push(event)
      return NONE

    case 'dart.detected': {
      const view = session.module.view(session.currentState, session.players)
      if ('visitLocked' in view && view.visitLocked) return NONE
      countDarts(session, session.currentState, 1)
      session.openVisitEvents.push(event)
      session.openDarts.push({ source: 'camera', corrected: false, thrownAt: at })
      return NONE
    }

    case 'dart.corrected': {
      const darts = dartEvents(session)
      const pos = darts.findIndex(e => e.data.index === event.data.index)
      if (pos !== -1) {
        const target = darts[pos]
        session.openVisitEvents[session.openVisitEvents.indexOf(target)] = {
          kind: 'dart.detected',
          data: { ...target.data, dart: event.data.dart },
        }
        markCorrected(session, pos)
      }
      return NONE
    }

    case 'takeout.finished':
    case 'visit.cleared':
      return commit(session, event, at)

    case 'board.resync':
      countDarts(session, session.currentState, -dartEvents(session).length)
      session.openVisitEvents = []
      session.openDarts = []
      return NONE

    case 'board.status':
      return NONE
  }
}

function applyUserAction(session: Session, action: UserAction, at: Date): ApplyOutcome {
  switch (action.type) {
    case 'undo_dart': {
      const events = session.openVisitEvents
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].kind !== 'dart.detected') continue
        events.splice(i, 1)
        // A visit.opened left without darts goes too
        if (i > 0 && events[i - 1].kind === 'visit.opened' && !events.slice(i).some(isDart)) events.splice(i - 1, 1)
        session.openDarts = session.openDarts.slice(0, -1)
        countDarts(session, session.currentState, -1)
        break
      }
      return NONE
    }

    case 'correct_dart': {
      const target = dartEvents(session).find((_, i) => i === action.visitIndex)
      if (target) {
        // The camera position no longer matches the corrected segment, so drop it,
        // unless the dart was moved to a new spot on the board
        const rest = { ...target.data.dart }
        delete rest.coords
        delete rest.polar
        session.openVisitEvents[session.openVisitEvents.indexOf(target)] = {
          kind: 'dart.detected',
          data: { ...target.data, dart: { ...rest, ...manualDart(action.segment, action.coords) } },
        }
        markCorrected(session, action.visitIndex)
      }
      return NONE
    }

    case 'takeout': {
      // An empty turn (nothing thrown or nothing detected) counts as three misses
      if (session.openVisitEvents.length === 0 && !inBullOff(session, session.currentState)
          && !hasWinner(session, session.currentState)) {
        const miss = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
        session.openVisitEvents = [
          { kind: 'visit.opened', data: { visit_id: 'manual' } },
          ...[0, 1, 2].map(index => ({
            kind: 'dart.detected' as const,
            data: { visit_id: 'manual', index, dart: manualDart({ ...miss }), source_seq: 0 },
          })),
        ]
        session.openDarts = [0, 1, 2].map(() => ({ source: 'manual' as const, corrected: false, thrownAt: at }))
        countDarts(session, session.currentState, 3)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      }
      if (session.openVisitEvents.length === 0) return NONE
      return commit(session, { kind: 'takeout.finished', data: {} }, at)
    }

    case 'add_dart': {
      const dartCount = dartEvents(session).length
      if (dartCount >= 3) return NONE
      // A finished visit (bust, checkout, win) takes no more darts
      const now = session.module.view(session.currentState, session.players)
      if (('visitLocked' in now && now.visitLocked) || now.winner !== null) return NONE
      if (session.openVisitEvents.length === 0) {
        session.openVisitEvents.push({ kind: 'visit.opened', data: { visit_id: 'manual' } })
      }
      // Use the state after the (possibly new) visit.opened to find the thrower
      countDarts(session, refoldVisit(session.module, session.committedState, session.openVisitEvents), 1)
      session.openVisitEvents.push({
        kind: 'dart.detected',
        data: { visit_id: 'manual', index: dartCount, dart: manualDart(action.segment, action.coords), source_seq: 0 },
      })
      session.openDarts.push({ source: 'manual', corrected: false, thrownAt: at })
      return NONE
    }

    default: {
      // The game module's own actions (e.g. the bull off's skip/rethrow/start) end the
      // open visit and become committed state
      const next = session.module.onUserAction(session.currentState, action).state
      if (next === session.currentState) return NONE
      session.committedState = next
      session.openVisitEvents = []
      session.openDarts = []
      return { committed: null, won: hasWinner(session, next) }
    }
  }
}

// Ends the open visit with `closing` (takeout.finished or visit.cleared) and describes it
function commit(session: Session, closing: BoardEvent, at: Date): ApplyOutcome {
  const mod = session.module
  const events = session.openVisitEvents
  const lead = events.slice(0, events[0]?.kind === 'visit.opened' ? 1 : 0)
  const start = refoldVisit(mod, session.committedState, lead)
  const end = refoldVisit(mod, session.committedState, events)
  const after = mod.onBoardEvent(end, closing).state

  if (!inBullOff(session, end)) {
    const owner = mod.getCurrentPlayer(end)
    session.totalVisits[owner] = (session.totalVisits[owner] ?? 0) + 1
  }

  const darts = dartEvents(session).map((e, index): HistoryDart => {
    const meta = session.openDarts[index]
    return {
      index,
      segment: e.data.dart.segment,
      coords: e.data.dart.coords ?? null,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- openDarts can be shorter after an old log is replayed
      source: meta?.source ?? 'camera',
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- openDarts can be shorter after an old log is replayed
      corrected: meta?.corrected ?? false,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- openDarts can be shorter after an old log is replayed
      thrownAt: (meta?.thrownAt ?? at).toISOString(),
    }
  })
  const visit: CommittedVisit<unknown> = {
    visit: session.visitCount,
    seat: mod.getCurrentPlayer(start),
    leg: mod.getLeg?.(start) ?? 0,
    phase: inBullOff(session, start) ? 'bulloff' : 'game',
    committedAt: at.toISOString(),
    darts, start, end, after,
  }

  session.visitCount++
  session.committedState = after
  session.openVisitEvents = []
  session.openDarts = []
  return { committed: visit, won: hasWinner(session, after) }
}
