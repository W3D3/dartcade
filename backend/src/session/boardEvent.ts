import { isBoolean, isNumber, isOneOf, isOptional, isRecord, isString } from '../guards.js'
import type { BoardEvent, Dart, DartCorrectedData, DartDetectedData, Segment } from './types.js'

// Runtime checks of the bridge's event data (schema/adbridge-v1.json) for the events
// whose data the games read. Bridge events arrive as untyped JSON (live or from the DB).

const BEDS = ['SingleInner', 'SingleOuter', 'Single', 'Double', 'Triple', 'Outside'] as const
const MULTIPLIERS = [0, 1, 2, 3] as const

export function isSegment(v: unknown): v is Segment {
  return isRecord(v) && isString(v.name) && isNumber(v.number)
    && isOneOf(BEDS, v.bed) && isOneOf(MULTIPLIERS, v.multiplier)
}

function isXY(v: unknown): v is { x: number; y: number } {
  return isRecord(v) && isNumber(v.x) && isNumber(v.y)
}

function isPolar(v: unknown): v is { r: number; theta_deg: number } {
  return isRecord(v) && isNumber(v.r) && isNumber(v.theta_deg)
}

export function isDart(v: unknown): v is Dart {
  return isRecord(v) && isSegment(v.segment) && isNumber(v.score)
    && isOptional(v.coords, isXY) && isOptional(v.polar, isPolar) && isOptional(v.bouncer, isBoolean)
}

export function isDartDetectedData(v: unknown): v is DartDetectedData {
  return isRecord(v) && isString(v.visit_id) && isNumber(v.index) && isDart(v.dart) && isNumber(v.source_seq)
}

export function isDartCorrectedData(v: unknown): v is DartCorrectedData {
  return isRecord(v) && isString(v.visit_id) && isNumber(v.index) && isDart(v.dart)
    && isDart(v.previous) && isNumber(v.source_seq)
}

/**
 * The board event for a bridge event of this kind, or null when the games don't use
 * the kind (or its dart data doesn't match the bridge schema).
 */
export function parseBoardEvent(kind: string, data: unknown): BoardEvent | null {
  switch (kind) {
    case 'dart.detected':
      return isDartDetectedData(data) ? { kind, data } : null
    case 'dart.corrected':
      return isDartCorrectedData(data) ? { kind, data } : null
    case 'visit.opened':
    case 'takeout.finished':
    case 'visit.cleared':
    case 'board.resync':
    case 'board.status':
      return { kind, data }
    default:
      return null
  }
}

/** The board.status fields the session keeps; absent (or mistyped) fields get defaults. */
export function readBoardStatus(data: unknown): { status: string; running: boolean; event: string } {
  const d: Record<string, unknown> = isRecord(data) ? data : {}
  return {
    status:  isString(d.status) ? d.status : '',
    running: isBoolean(d.running) ? d.running : false,
    event:   isString(d.event) ? d.event : '',
  }
}
