// The coach's review of one player's finished X01 leg: graded visits, strategy notes and skills.
// Pure; the frontend and the backend run it on the game's stored detail.
export type { CoachNote } from './notes.js'
export type { CoachStats, DoubleStat } from './stats.js'
export type { CoachLeg } from './walk.js'
export { NOTE_THRESHOLD } from './notes.js'
export { coachable } from './coachable.js'
export { reviewLeg } from './review.js'
export type { LegCounts, LegReview, ReviewContext, ReviewDart, ReviewVisit, SkillGrade } from './review.js'
export { VISIT_GRADES } from './grade.js'
export type { GradeRule, VisitGrade, VisitTag, VisitValue } from './grade.js'
export { loadCoachModels, loadModel, type CoachModel, type CoachModels } from './model.js'
export { COACH_TIERS, suggestedTier, targetTier, type CoachTarget, type CoachTierId } from './tiers.js'
