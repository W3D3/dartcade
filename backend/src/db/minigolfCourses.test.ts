import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { openTestSchema } from './testSchema.js'
import type { Database } from './schema.js'
import {
  seedOfficialCourses,
  listCourses,
  getCourse,
  getHole,
  createCourse,
  createHole,
  saveCourseDraft,
  saveHoleDraft,
  publishCourse,
  discardCourseDraft,
  deleteHole,
  deleteCourse,
  publishedCourse,
  publishedOfficialHoles,
  type CourseContent,
} from './minigolfCourses.js'
import { greenhornCourse } from '../shared/minigolf/courses/greenhorn.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import type { Hole } from '../shared/minigolf/types.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('minigolf courses and holes', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('minigolf_courses_test'))
  })

  afterAll(async () => {
    await close()
  })

  it('seeds the test and Greenhorn courses, published, with their holes', async () => {
    await seedOfficialCourses(db)
    for (const seeded of [testCourse, greenhornCourse]) {
      const course = await getCourse(db, seeded.id)
      expect(course?.draft).toBeNull()
      expect(course?.published).toEqual({
        name: seeded.name,
        description: expect.any(String),
        difficulty: 1,
        holeIds: seeded.holes.map(h => h.id),
      })
      for (const h of seeded.holes) {
        const hole = await getHole(db, h.id)
        expect(hole?.draft).toBeNull()
        expect(hole?.published).toEqual(h)
      }
    }
  })

  it('seeding again changes nothing', async () => {
    const before = await listCourses(db, { drafts: true })
    await seedOfficialCourses(db)
    const after = await listCourses(db, { drafts: true })
    expect(after).toEqual(before)
  })

  it('seeding adds a course missing from an already seeded table, leaving the others alone', async () => {
    await deleteCourse(db, greenhornCourse.id)
    const test = await getCourse(db, 'test')
    await seedOfficialCourses(db)
    expect(await getCourse(db, 'test')).toEqual(test)
    expect((await getCourse(db, greenhornCourse.id))?.published?.holeIds).toEqual(greenhornCourse.holes.map(h => h.id))
  })

  it('listCourses without drafts only returns published courses, draft nulled', async () => {
    const withDrafts = await listCourses(db, { drafts: false })
    expect(withDrafts.map(c => c.id)).toContain('test')
    expect(withDrafts.find(c => c.id === 'test')?.draft).toBeNull()
  })

  it('saveHoleDraft with the current version updates and bumps it; a stale version conflicts', async () => {
    const before = await getHole(db, 'test-straight')
    expect(before?.version).toBe(1)
    const edited: Hole = { ...testCourse.holes[0], par: 4 }

    const updated = await saveHoleDraft(db, 'test-straight', 1, edited)
    expect(updated).not.toBe('conflict')
    expect(updated).not.toBe('missing')
    if (updated === 'conflict' || updated === 'missing') throw new Error('unreachable')
    expect(updated.version).toBe(2)
    expect(updated.draft).toEqual(edited)
    expect(updated.published).toEqual(testCourse.holes[0])

    const stale = await saveHoleDraft(db, 'test-straight', 1, edited)
    expect(stale).toBe('conflict')

    const missing = await saveHoleDraft(db, 'does-not-exist', 1, edited)
    expect(missing).toBe('missing')
  })

  it('publishCourse copies hole drafts to published and clears them', async () => {
    const result = await publishCourse(db, 'test')
    expect(result).not.toBe('missing')
    if (result === 'missing' || !result.ok) throw new Error('expected ok')
    expect(result.course.published?.holeIds).toEqual(testCourse.holes.map(h => h.id))

    const hole = await getHole(db, 'test-straight')
    expect(hole?.draft).toBeNull()
    expect(hole?.published?.par).toBe(4)
  })

  it("a hole draft with a crossing outline blocks publish with that hole's checks, changing nothing", async () => {
    const crossing: Hole = {
      ...testCourse.holes[1],
      outline: [
        [0, 0],
        [500, 500],
        [500, 0],
        [0, 500],
      ],
    }
    const before = await getHole(db, 'test-dogleg')
    const saved = await saveHoleDraft(db, 'test-dogleg', before!.version, crossing)
    expect(saved).not.toBe('conflict')
    expect(saved).not.toBe('missing')

    const result = await publishCourse(db, 'test')
    expect(result).not.toBe('missing')
    if (result === 'missing' || result.ok) throw new Error('expected a blocked publish')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].holeId).toBe('test-dogleg')
    expect(result.problems[0].checks.some(c => c.level === 'error')).toBe(true)

    // Nothing changed: the dogleg draft is still there, the straight hole (clean) wasn't republished either
    const dogleg = await getHole(db, 'test-dogleg')
    expect(dogleg?.draft).toEqual(crossing)
    expect(dogleg?.published).toEqual(testCourse.holes[1])
    const course = await getCourse(db, 'test')
    expect(course?.draft).toBeNull()
  })

  it('publishCourse of a missing course returns missing', async () => {
    expect(await publishCourse(db, 'does-not-exist')).toBe('missing')
  })

  it('a hole shared by two courses, published via one, reads the new version through the other', async () => {
    const hole: Hole = {
      id: 'shared-hole',
      name: 'Shared',
      par: 2,
      outline: [
        [0, 0],
        [500, 0],
        [500, 1000],
        [0, 1000],
      ],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [250, 900],
      cup: { at: [250, 100], r: 80 },
    }
    await createHole(db, hole)
    const contentA: CourseContent = { name: 'Course A', description: 'A.', difficulty: 1, holeIds: ['shared-hole'] }
    const contentB: CourseContent = { name: 'Course B', description: 'B.', difficulty: 1, holeIds: ['shared-hole'] }
    const courseA = await createCourse(db, contentA)
    const courseB = await createCourse(db, contentB)

    // Publish both, so each has a published holeIds list that includes the shared hole
    const publishedA = await publishCourse(db, courseA.id)
    const publishedB = await publishCourse(db, courseB.id)
    if (publishedA === 'missing' || !publishedA.ok) throw new Error('expected A to publish')
    if (publishedB === 'missing' || !publishedB.ok) throw new Error('expected B to publish')

    // Edit the shared hole and publish only through course A
    const current = await getHole(db, 'shared-hole')
    const edited: Hole = { ...hole, par: 5 }
    await saveHoleDraft(db, 'shared-hole', current!.version, edited)
    const republishedA = await publishCourse(db, courseA.id)
    if (republishedA === 'missing' || !republishedA.ok) throw new Error('expected A to republish')

    const viaB = await publishedCourse(db, courseB.id)
    expect(viaB?.holes.find(h => h.id === 'shared-hole')?.par).toBe(5)
  })

  it('publishedOfficialHoles returns the holes of every published official course', async () => {
    const ids = (await publishedOfficialHoles(db)).map(h => h.id)
    expect(ids).toEqual(expect.arrayContaining([...testCourse.holes.map(h => h.id), 'shared-hole']))
  })

  it('saveCourseDraft with the current version updates and bumps it; a stale version conflicts', async () => {
    const content: CourseContent = { name: 'Save test', description: 'S.', difficulty: 2, holeIds: [] }
    const course = await createCourse(db, content)
    const edited: CourseContent = { ...content, name: 'Renamed' }

    const updated = await saveCourseDraft(db, course.id, course.version, edited)
    if (updated === 'conflict' || updated === 'missing') throw new Error('unreachable')
    expect(updated.version).toBe(course.version + 1)
    expect(updated.draft).toEqual(edited)

    expect(await saveCourseDraft(db, course.id, course.version, edited)).toBe('conflict')
    expect(await saveCourseDraft(db, 'does-not-exist', 1, edited)).toBe('missing')
  })

  it('deleteHole of a used hole returns in-use; an unused one deletes; a missing one is missing', async () => {
    expect(await deleteHole(db, 'shared-hole')).toBe('in-use')

    const unused: Hole = { ...testCourse.holes[0], id: 'unused-hole' }
    await createHole(db, unused)
    expect(await deleteHole(db, 'unused-hole')).toBe('deleted')
    expect(await getHole(db, 'unused-hole')).toBeUndefined()

    expect(await deleteHole(db, 'does-not-exist')).toBe('missing')
  })

  it('a draft referencing a deleted hole id makes publishCourse return a problem for that id', async () => {
    const content: CourseContent = { name: 'Ghost', description: 'G.', difficulty: 1, holeIds: ['ghost-hole'] }
    const course = await createCourse(db, content)

    const result = await publishCourse(db, course.id)
    if (result === 'missing' || result.ok) throw new Error('expected a blocked publish')
    expect(result.problems).toEqual([{ holeId: 'ghost-hole', checks: expect.any(Array) }])

    // Never published: reading it returns undefined
    expect(await publishedCourse(db, course.id)).toBeUndefined()
  })

  it('publishedCourse of a never-published course, or an unknown id, is undefined', async () => {
    expect(await publishedCourse(db, 'does-not-exist')).toBeUndefined()
  })

  it("discardCourseDraft clears the course draft and its holes' drafts, keeping a hole draft another course still uses", async () => {
    const shared: Hole = { ...testCourse.holes[0], id: 'discard-shared-hole' }
    await createHole(db, shared)
    const contentD: CourseContent = { name: 'D', description: 'D.', difficulty: 1, holeIds: ['discard-shared-hole'] }
    const contentE: CourseContent = { name: 'E', description: 'E.', difficulty: 1, holeIds: ['discard-shared-hole'] }
    const courseD = await createCourse(db, contentD)
    const courseE = await createCourse(db, contentE)
    for (const c of [courseD, courseE]) {
      const r = await publishCourse(db, c.id)
      if (r === 'missing' || !r.ok) throw new Error('expected a publish')
      await saveCourseDraft(db, c.id, r.course.version, { ...(c.id === courseD.id ? contentD : contentE), name: 'renamed' })
    }
    const edited = { ...shared, par: 4 }
    await saveHoleDraft(db, 'discard-shared-hole', (await getHole(db, 'discard-shared-hole'))!.version, edited)

    const afterD = await discardCourseDraft(db, courseD.id)
    expect(afterD).not.toBe('missing')
    if (afterD === 'missing') throw new Error('unreachable')
    expect(afterD.draft).toBeNull()
    // courseE still uses the hole, so its draft is kept
    expect((await getHole(db, 'discard-shared-hole'))?.draft).toEqual(edited)

    await deleteCourse(db, courseD.id)
    const afterE = await discardCourseDraft(db, courseE.id)
    if (afterE === 'missing') throw new Error('unreachable')
    expect(afterE.draft).toBeNull()
    // no other course uses it any more: its draft is cleared too
    expect((await getHole(db, 'discard-shared-hole'))?.draft).toBeNull()

    expect(await discardCourseDraft(db, 'does-not-exist')).toBe('missing')
  })

  it('discarding a never-published course changes nothing', async () => {
    const content: CourseContent = { name: 'New', description: 'N.', difficulty: 1, holeIds: [] }
    const course = await createCourse(db, content)
    const after = await discardCourseDraft(db, course.id)
    if (after === 'missing') throw new Error('unreachable')
    expect(after.draft).toEqual(content)
    expect(after.version).toBe(course.version)
  })

  it('discarding a course keeps the draft of a hole that was never published', async () => {
    const old: Hole = { ...testCourse.holes[0], id: 'discard-old-hole' }
    const added: Hole = { ...testCourse.holes[1], id: 'discard-new-hole' }
    await createHole(db, old)
    const course = await createCourse(db, { name: 'Grow', description: 'G.', difficulty: 1, holeIds: ['discard-old-hole'] })
    const published = await publishCourse(db, course.id)
    if (published === 'missing' || !published.ok) throw new Error('expected a publish')
    await createHole(db, added)
    await saveCourseDraft(db, course.id, published.course.version, {
      name: 'Grow',
      description: 'G.',
      difficulty: 1,
      holeIds: ['discard-old-hole', 'discard-new-hole'],
    })

    await discardCourseDraft(db, course.id)
    expect((await getHole(db, 'discard-new-hole'))?.draft).toEqual(added)
  })

  it("discarding a course clears its holes' drafts even when the course itself has no draft", async () => {
    const hole: Hole = { ...testCourse.holes[0], id: 'discard-only-hole' }
    await createHole(db, hole)
    const course = await createCourse(db, { name: 'Only', description: 'O.', difficulty: 1, holeIds: ['discard-only-hole'] })
    const published = await publishCourse(db, course.id)
    if (published === 'missing' || !published.ok) throw new Error('expected a publish')
    const row = await getHole(db, 'discard-only-hole')
    await saveHoleDraft(db, 'discard-only-hole', row!.version, { ...hole, par: 4 })

    await discardCourseDraft(db, course.id)
    expect((await getHole(db, 'discard-only-hole'))?.draft).toBeNull()
  })

  it('discarding a course keeps the draft of a hole another published course uses', async () => {
    const hole: Hole = { ...testCourse.holes[0], id: 'discard-published-shared' }
    await createHole(db, hole)
    const content = (name: string): CourseContent => ({ name, description: '.', difficulty: 1, holeIds: ['discard-published-shared'] })
    const courseA = await createCourse(db, content('A'))
    const courseB = await createCourse(db, content('B'))
    for (const c of [courseA, courseB]) {
      const r = await publishCourse(db, c.id)
      if (r === 'missing' || !r.ok) throw new Error('expected a publish')
    }
    // Course A has a draft of its own; the hole is edited from course B's editor (B gets no course draft)
    const savedA = await saveCourseDraft(db, courseA.id, (await getCourse(db, courseA.id))!.version, content('A renamed'))
    if (typeof savedA === 'string') throw new Error('expected a save')
    const row = await getHole(db, 'discard-published-shared')
    await saveHoleDraft(db, 'discard-published-shared', row!.version, { ...hole, par: 4 })

    await discardCourseDraft(db, courseA.id)
    expect((await getHole(db, 'discard-published-shared'))?.draft).toEqual({ ...hole, par: 4 })
  })

  it('a course with no holes is refused publish, with a problem for the course itself', async () => {
    const course = await createCourse(db, { name: 'Empty', description: 'E.', difficulty: 1, holeIds: [] })
    const result = await publishCourse(db, course.id)
    if (result === 'missing' || result.ok) throw new Error('expected a blocked publish')
    expect(result.problems).toEqual([{ holeId: '', checks: [{ level: 'error', message: 'Add at least one hole' }] }])
    expect((await getCourse(db, course.id))?.published).toBeNull()
  })

  it('discarding locks its holes in id order (as publish does), so the two never deadlock', async () => {
    // Inserted b first: an unordered multi-row UPDATE meets b before a
    for (const id of ['lock-order-b', 'lock-order-a']) await createHole(db, { ...testCourse.holes[0], id })
    const course = await createCourse(db, { name: 'Locks', description: '.', difficulty: 1, holeIds: ['lock-order-b', 'lock-order-a'] })
    const published = await publishCourse(db, course.id)
    if (published === 'missing' || !published.ok) throw new Error('expected a publish')
    for (const id of ['lock-order-b', 'lock-order-a'])
      await saveHoleDraft(db, id, (await getHole(db, id))!.version, { ...testCourse.holes[0], id, par: 4 })
    let discarding: Promise<unknown> = Promise.resolve()
    let bFree = false
    await db.transaction().execute(async trx => {
      // Someone (a publish) holds a, the first in id order
      await trx.selectFrom('minigolf_holes').select('id').where('id', '=', 'lock-order-a').forUpdate().execute()
      discarding = discardCourseDraft(db, course.id)
      await new Promise(r => setTimeout(r, 300))
      // In id order the discard waits for a before touching b, so b is still free
      bFree = await db
        .transaction()
        .execute(t => t.selectFrom('minigolf_holes').select('id').where('id', '=', 'lock-order-b').forUpdate().noWait().execute())
        .then(
          () => true,
          () => false,
        )
    })
    await discarding
    expect(bFree).toBe(true)
  })

  it('deleteCourse removes the row', async () => {
    const content: CourseContent = { name: 'Temp', description: 'T.', difficulty: 2, holeIds: [] }
    const course = await createCourse(db, content)
    expect(await deleteCourse(db, course.id)).toBe(true)
    expect(await getCourse(db, course.id)).toBeUndefined()
    expect(await deleteCourse(db, course.id)).toBe(false)
  })

  it('discarding a course bumps the version of the holes whose draft it clears, so a stale save conflicts', async () => {
    const hole: Hole = { ...testCourse.holes[0], id: 'discard-conflict-hole' }
    await createHole(db, hole)
    const content: CourseContent = { name: 'DiscardConflict', description: 'D.', difficulty: 1, holeIds: ['discard-conflict-hole'] }
    const course = await createCourse(db, content)
    const published = await publishCourse(db, course.id)
    if (published === 'missing' || !published.ok) throw new Error('expected a publish')
    const before = await getHole(db, 'discard-conflict-hole')
    const saved = await saveHoleDraft(db, 'discard-conflict-hole', before!.version, { ...hole, par: 4 })
    if (typeof saved === 'string') throw new Error('expected a save')

    await discardCourseDraft(db, course.id)

    // An admin still holding the version from before the discard now conflicts
    expect(await saveHoleDraft(db, 'discard-conflict-hole', saved.version, hole)).toBe('conflict')
  })

  it('publishing a course bumps the version of its published holes (and the course itself), so a stale save conflicts', async () => {
    const hole: Hole = { ...testCourse.holes[0], id: 'publish-conflict-hole' }
    await createHole(db, hole)
    const content: CourseContent = { name: 'PublishConflict', description: 'P.', difficulty: 1, holeIds: ['publish-conflict-hole'] }
    const course = await createCourse(db, content)
    const before = await getHole(db, 'publish-conflict-hole')
    expect(before?.version).toBe(1)

    const result = await publishCourse(db, course.id)
    if (result === 'missing' || !result.ok) throw new Error('expected ok')
    expect(result.course.version).toBeGreaterThan(course.version)

    // An admin still holding version 1 (from before the publish) now conflicts
    expect(await saveHoleDraft(db, 'publish-conflict-hole', 1, hole)).toBe('conflict')
  })

  it('seeding again after every course was deleted recreates the test course without failing on its still-existing holes', async () => {
    for (const c of await listCourses(db, { drafts: true })) await deleteCourse(db, c.id)
    expect(await listCourses(db, { drafts: true })).toEqual([])

    await expect(seedOfficialCourses(db)).resolves.toBeUndefined()

    const course = await getCourse(db, 'test')
    expect(course?.published?.holeIds).toEqual(testCourse.holes.map(h => h.id))
  })
})
