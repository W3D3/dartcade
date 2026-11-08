import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { createFastify } from './fastify.js'
import { minigolfCoursesApiPlugin } from './minigolfCourses.js'
import { seedOfficialCourses, createHole, createCourse, listCourses, canReadCourse } from '../db/minigolfCourses.js'
import { setupFlags } from '../flags/index.js'
import { MINIGOLF_LIMITS } from '../shared/minigolf/limits.js'
import type { Hole, Shape } from '../shared/minigolf/types.js'

// Signed in as whoever the x-user header names; without it, not signed in (voices.test.ts's pattern)
vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, reply: any, done: () => void) => {
    if (!req.headers['x-user']) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    req.userId = req.headers['x-user']
    done()
  }),
}))

// requireAdmin (auth/admin.ts) reads the db singleton (db/index.ts) directly, not a plugin opt;
// redirect it to the test schema so a real `role` column decides who is an admin.
const dbRef = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../db/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../db/index.js')>()
  return {
    ...actual,
    get db() {
      return dbRef.current
    },
  }
})

const validHole = (id: string, overrides: Partial<Hole> = {}): Hole => ({
  id,
  name: 'Straight',
  par: 2,
  outline: [
    [0, 0],
    [500, 0],
    [500, 3000],
    [0, 3000],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [250, 2750],
  cup: { at: [250, 300], r: 80 },
  ...overrides,
})

// Each test drafts and publishes through the DB; 5 s is too tight under the full parallel suite
describe.skipIf(!process.env.TEST_DATABASE_URL)('minigolf courses API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('minigolf_courses_api_test'))
    dbRef.current = db
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: false, image: null, role: 'admin' },
        { id: 'player', name: 'Player', email: 'player@example.com', emailVerified: false, image: null, role: null },
        { id: 'owner', name: 'Olive Owner', email: 'owner@example.com', emailVerified: false, image: null, role: null },
        { id: 'other', name: 'Otto Other', email: 'other@example.com', emailVerified: false, image: null, role: null },
        { id: 'mod', name: 'Mo Mod', email: 'mod@example.com', emailVerified: false, image: null, role: 'moderator' },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  afterEach(async () => {
    await db.deleteFrom('minigolf_courses').execute()
    await db.deleteFrom('minigolf_holes').execute()
  })

  function app() {
    const a = createFastify()
    a.register(minigolfCoursesApiPlugin, { db })
    return a
  }
  const asAdmin = { 'x-user': 'admin' }
  const asPlayer = { 'x-user': 'player' }

  async function createHoleAs(headers: Record<string, string>, hole: Hole) {
    return app().inject({ method: 'POST', url: '/api/minigolf/holes', headers, payload: { hole } })
  }
  async function createCourseAs(headers: Record<string, string>, content: Record<string, unknown>) {
    return app().inject({ method: 'POST', url: '/api/minigolf/courses', headers, payload: content })
  }

  describe('players', () => {
    it('see only published official courses, without a draft', async () => {
      const hole = await createHoleAs(asAdmin, validHole('links-1'))
      const created = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [hole.json().id] })
      const { id } = created.json()

      const list = await app().inject({ method: 'GET', url: '/api/minigolf/courses', headers: asPlayer })
      expect(list.statusCode).toBe(200)
      expect(list.json().courses).toEqual([])

      const get = await app().inject({ method: 'GET', url: `/api/minigolf/courses/${id}`, headers: asPlayer })
      expect(get.statusCode).toBe(404)

      await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      const published = await app().inject({ method: 'GET', url: `/api/minigolf/courses/${id}`, headers: asPlayer })
      expect(published.statusCode).toBe(200)
      expect(published.json()).not.toHaveProperty('draft')
      expect(published.json()).not.toHaveProperty('hasChanges')
      expect(published.json().published).toMatchObject({ name: 'Links' })

      const listAfter = await app().inject({ method: 'GET', url: '/api/minigolf/courses', headers: asPlayer })
      expect(listAfter.json().courses).toHaveLength(1)
      expect(listAfter.json().courses[0]).not.toHaveProperty('draft')
    })

    it('get 403 on every write and on GET /holes, and read only the published content of a hole', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('p'))
      const holeId = holeRes.json().id
      const created = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })
      const { id } = created.json()
      await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      const hole = await app().inject({ method: 'GET', url: `/api/minigolf/holes/${holeId}`, headers: asPlayer })
      expect(hole.statusCode).toBe(200)
      expect(hole.json()).toMatchObject({ draft: null, published: { name: 'Straight' } })

      const attempts = [
        () =>
          app().inject({
            method: 'POST',
            url: '/api/minigolf/courses',
            headers: asPlayer,
            payload: { name: 'x', description: '', difficulty: 1, holeIds: [] },
          }),
        () =>
          app().inject({
            method: 'PATCH',
            url: `/api/minigolf/courses/${id}`,
            headers: asPlayer,
            payload: { version: 0, content: { name: 'x', description: '', difficulty: 1, holeIds: [] } },
          }),
        () => app().inject({ method: 'DELETE', url: `/api/minigolf/courses/${id}`, headers: asPlayer }),
        () => app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asPlayer }),
        () => app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/discard`, headers: asPlayer }),
        () => app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/unpublish`, headers: asPlayer }),
        () => app().inject({ method: 'GET', url: '/api/minigolf/holes', headers: asPlayer }),
        () => app().inject({ method: 'POST', url: '/api/minigolf/holes', headers: asPlayer, payload: { hole: validHole('h') } }),
        () =>
          app().inject({
            method: 'PATCH',
            url: `/api/minigolf/holes/${holeId}`,
            headers: asPlayer,
            payload: { version: 1, hole: validHole(holeId) },
          }),
        () => app().inject({ method: 'DELETE', url: `/api/minigolf/holes/${holeId}`, headers: asPlayer }),
      ]
      for (const attempt of attempts) {
        const res = await attempt()
        expect(res.statusCode).toBe(403)
        expect(res.json()).toEqual({ error: 'forbidden' })
      }
    })
  })

  describe('admins', () => {
    it('create a hole and a course', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('new-hole'))
      expect(holeRes.statusCode).toBe(201)
      const holeRow = holeRes.json()
      expect(holeRow.id).not.toBe('new-hole') // a fresh ulid, not the id the client sent
      expect(holeRow.draft).toMatchObject({ name: 'Straight' })
      expect(holeRow.published).toBeNull()

      const courseRes = await createCourseAs(asAdmin, { name: 'Links', description: 'a course', difficulty: 2, holeIds: [holeRow.id] })
      expect(courseRes.statusCode).toBe(201)
      const courseRow = courseRes.json()
      expect(courseRow.draft).toMatchObject({ name: 'Links', holeIds: [holeRow.id] })
      expect(courseRow.published).toBeNull()
      expect(courseRow.version).toBe(1)
    })

    it('copies a hole with a fresh id and "(copy)" in the name', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('source'))
      const sourceId = holeRes.json().id

      const res = await app().inject({ method: 'POST', url: '/api/minigolf/holes', headers: asAdmin, payload: { copyOf: sourceId } })
      expect(res.statusCode).toBe(201)
      const copy = res.json()
      expect(copy.id).not.toBe(sourceId)
      expect(copy.draft.name).toBe('Straight (copy)')
    })

    it('404s copying a hole that does not exist', async () => {
      const res = await app().inject({ method: 'POST', url: '/api/minigolf/holes', headers: asAdmin, payload: { copyOf: 'nope' } })
      expect(res.statusCode).toBe(404)
    })

    it('saves a hole draft, keeping the row id even when the body names another hole.id', async () => {
      const created = await createHoleAs(asAdmin, validHole('new-hole'))
      const { id, version }: { id: string; version: number } = created.json()

      const saved = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/holes/${id}`,
        headers: asAdmin,
        payload: { version, hole: validHole('some-other-id', { name: 'Edited' }) },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().id).toBe(id)
      expect(saved.json().version).toBe(version + 1)
      expect(saved.json().draft).toMatchObject({ id, name: 'Edited' })

      const roundTrip = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/holes/${id}`,
        headers: asAdmin,
        payload: { version: saved.json().version, hole: validHole(id, { name: 'Edited again' }) },
      })
      expect(roundTrip.statusCode).toBe(200)
      expect(roundTrip.json().draft.name).toBe('Edited again')

      const stale = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/holes/${id}`,
        headers: asAdmin,
        payload: { version, hole: validHole(id, { name: 'Stale' }) },
      })
      expect(stale.statusCode).toBe(409)
      expect(stale.json()).toEqual({ error: 'conflict' })
    })

    it('saves a hole draft with a shape, and GET returns it unchanged', async () => {
      const created = await createHoleAs(asAdmin, validHole('with-shape'))
      const { id, version }: { id: string; version: number } = created.json()
      const shape: Shape = {
        corners: [
          [0, 0],
          [500, 0],
          [500, 3000],
          [0, 3000],
        ],
        curves: [null, { c1: [520, 1000], c2: [520, 2000] }, null, null],
        circles: [{ center: [250, 300], r: 400 }],
      }

      const saved = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/holes/${id}`,
        headers: asAdmin,
        payload: { version, hole: validHole(id, { shape }) },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().draft.shape).toEqual(shape)

      const fetched = await app().inject({ method: 'GET', url: `/api/minigolf/holes/${id}`, headers: asAdmin })
      expect(fetched.statusCode).toBe(200)
      expect(fetched.json().draft.shape).toEqual(shape)
    })

    it('400s saving a shape with a radius that is not positive or curves that do not match its corners', async () => {
      const { id, version }: { id: string; version: number } = (await createHoleAs(asAdmin, validHole('bad-shape'))).json()
      const corners = validHole('x').outline
      const bad: Shape[] = [
        { corners, curves: corners.map(() => null), circles: [{ center: [250, 300], r: 0 }] },
        { corners, curves: [null], circles: [] },
      ]
      for (const shape of bad) {
        const save = (hole: Hole) =>
          app().inject({ method: 'PATCH', url: `/api/minigolf/holes/${id}`, headers: asAdmin, payload: { version, hole } })
        expect((await save(validHole(id, { shape }))).statusCode).toBe(400)
        expect((await createHoleAs(asAdmin, validHole('new', { shape }))).statusCode).toBe(400)
      }
    })

    it('404s saving a draft for a hole that does not exist', async () => {
      const res = await app().inject({
        method: 'PATCH',
        url: '/api/minigolf/holes/nope',
        headers: asAdmin,
        payload: { version: 1, hole: validHole('nope') },
      })
      expect(res.statusCode).toBe(404)
    })

    it('saves a draft with a version round-trip, and 409s on a stale version', async () => {
      const created = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [] })
      const { id, version }: { id: string; version: number } = created.json()

      const saved = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/courses/${id}`,
        headers: asAdmin,
        payload: { version, content: { name: 'Links 2', description: '', difficulty: 1, holeIds: [] } },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json().version).toBe(version + 1)
      expect(saved.json().draft.name).toBe('Links 2')

      const stale = await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/courses/${id}`,
        headers: asAdmin,
        payload: { version, content: { name: 'Links 3', description: '', difficulty: 1, holeIds: [] } },
      })
      expect(stale.statusCode).toBe(409)
      expect(stale.json()).toEqual({ error: 'conflict' })
    })

    it('publishes a course with a good hole', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('good'))
      const holeId = holeRes.json().id
      const courseRes = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })
      const courseId = courseRes.json().id

      const published = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${courseId}/publish`, headers: asAdmin })
      expect(published.statusCode).toBe(200)
      expect(published.json().published).toMatchObject({ name: 'Links', holeIds: [holeId] })
      expect(published.json().draft).toBeNull()
    })

    it('422s publishing a course with a broken hole, listing the problems', async () => {
      // Tee outside the outline: a blocking error (validateHole)
      const brokenHole = validHole('broken', { tee: [-999, -999] })
      const holeRes = await createHoleAs(asAdmin, brokenHole)
      const holeId = holeRes.json().id
      const courseRes = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })
      const courseId = courseRes.json().id

      const res = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${courseId}/publish`, headers: asAdmin })
      expect(res.statusCode).toBe(422)
      expect(res.json().error).toBe('invalid')
      expect(res.json().problems).toEqual([{ holeId, checks: expect.arrayContaining([expect.objectContaining({ level: 'error' })]) }])
    })

    it('422s publishing a course whose hole has a bad circle, naming the circle', async () => {
      const { id: holeId } = (await createHoleAs(asAdmin, validHole('circle'))).json()
      // Written straight to the row: the API refuses such a circle on save
      const shape: Shape = { corners: validHole('x').outline, curves: [null, null, null, null], circles: [{ center: [250, 300], r: 0 }] }
      await db
        .updateTable('minigolf_holes')
        .set({ draft: JSON.stringify(validHole(holeId, { shape })) })
        .where('id', '=', holeId)
        .execute()
      const { id } = (await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })).json()

      const res = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      expect(res.statusCode).toBe(422)
      expect(res.json().problems).toEqual([
        { holeId, checks: [{ level: 'error', message: 'circle 1 radius must be positive', element: { kind: 'circle', index: 0 } }] },
      ])
    })

    it('422s publishing a course with no holes, with a problem for the course itself', async () => {
      const { id } = (await createCourseAs(asAdmin, { name: 'Empty', description: '', difficulty: 1, holeIds: [] })).json()
      const res = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      expect(res.statusCode).toBe(422)
      expect(res.json().problems).toEqual([{ holeId: '', checks: [{ level: 'error', message: 'Add at least one hole' }] }])
    })

    it('counts a published course as changed while one of its holes has a draft', async () => {
      const hole = (await createHoleAs(asAdmin, validHole('changes'))).json()
      const { id } = (await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [hole.id] })).json()
      expect((await createCourseAs(asAdmin, { name: 'Other', description: '', difficulty: 1, holeIds: [] })).json().hasChanges).toBe(true)
      const published = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      expect(published.json().hasChanges).toBe(false)

      const { version } = (await app().inject({ method: 'GET', url: `/api/minigolf/holes/${hole.id}`, headers: asAdmin })).json()
      await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/holes/${hole.id}`,
        headers: asAdmin,
        payload: { version, hole: validHole(hole.id, { par: 3 }) },
      })
      const get = await app().inject({ method: 'GET', url: `/api/minigolf/courses/${id}`, headers: asAdmin })
      expect(get.json()).toMatchObject({ draft: null, hasChanges: true })
      const list = await app().inject({ method: 'GET', url: '/api/minigolf/courses', headers: asAdmin })
      expect(list.json().courses.find((c: any) => c.id === id).hasChanges).toBe(true)

      const discarded = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/discard`, headers: asAdmin })
      expect(discarded.json().hasChanges).toBe(false)
    })

    it('409s deleting a hole a course still uses', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('used'))
      const holeId = holeRes.json().id
      await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })

      const res = await app().inject({ method: 'DELETE', url: `/api/minigolf/holes/${holeId}`, headers: asAdmin })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual({ error: 'in use' })
    })

    it('404s on a course or hole that does not exist', async () => {
      const course = await app().inject({ method: 'GET', url: '/api/minigolf/courses/nope', headers: asAdmin })
      expect(course.statusCode).toBe(404)
      const hole = await app().inject({ method: 'GET', url: '/api/minigolf/holes/nope', headers: asAdmin })
      expect(hole.statusCode).toBe(404)
    })

    it('lists holes with how many courses use them, and searches by name', async () => {
      const holeRes = await createHoleAs(asAdmin, validHole('lib', { name: 'Windy' }))
      const holeId = holeRes.json().id
      await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [holeId] })

      const list = await app().inject({ method: 'GET', url: '/api/minigolf/holes', headers: asAdmin })
      expect(list.statusCode).toBe(200)
      const found = list.json().holes.find((h: any) => h.id === holeId)
      expect(found.usedBy).toBe(1)

      const search = await app().inject({ method: 'GET', url: '/api/minigolf/holes?search=windy', headers: asAdmin })
      expect(search.json().holes.map((h: any) => h.id)).toEqual([holeId])
      const noMatch = await app().inject({ method: 'GET', url: '/api/minigolf/holes?search=nope', headers: asAdmin })
      expect(noMatch.json().holes).toEqual([])
    })

    it('discards a course draft', async () => {
      const hole = (await createHoleAs(asAdmin, validHole('discard'))).json()
      const { id } = (await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [hole.id] })).json()
      const { version } = (await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })).json()
      await app().inject({
        method: 'PATCH',
        url: `/api/minigolf/courses/${id}`,
        headers: asAdmin,
        payload: { version, content: { name: 'Renamed', description: '', difficulty: 1, holeIds: [hole.id] } },
      })
      const res = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/discard`, headers: asAdmin })
      expect(res.statusCode).toBe(200)
      expect(res.json().draft).toBeNull()
    })

    it('deletes a course not used by anything', async () => {
      const created = await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [] })
      const { id } = created.json()
      const res = await app().inject({ method: 'DELETE', url: `/api/minigolf/courses/${id}`, headers: asAdmin })
      expect(res.statusCode).toBe(204)
    })

    it('409s deleting a built-in course, and says which courses are built in', async () => {
      await seedOfficialCourses(db)
      const res = await app().inject({ method: 'DELETE', url: '/api/minigolf/courses/greenhorn', headers: asAdmin })
      expect(res.statusCode).toBe(409)
      const { id } = (await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [] })).json()
      const list = await app().inject({ method: 'GET', url: '/api/minigolf/courses', headers: asAdmin })
      const builtIn = Object.fromEntries(list.json().courses.map((c: any) => [c.id, c.builtIn]))
      expect(builtIn).toEqual({ greenhorn: true, kingfisher: true, [id]: false })
    })

    it('unpublishes a course: players no longer see it, its content stays as the draft', async () => {
      const hole = (await createHoleAs(asAdmin, validHole('unpub'))).json()
      const { id } = (await createCourseAs(asAdmin, { name: 'Links', description: '', difficulty: 1, holeIds: [hole.id] })).json()
      await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/publish`, headers: asAdmin })
      const res = await app().inject({ method: 'POST', url: `/api/minigolf/courses/${id}/unpublish`, headers: asAdmin })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ published: null, publishedAt: null, draft: { name: 'Links', holeIds: [hole.id] } })
      const list = await app().inject({ method: 'GET', url: '/api/minigolf/courses', headers: asPlayer })
      expect(list.json().courses).toEqual([])
      const missing = await app().inject({ method: 'POST', url: '/api/minigolf/courses/nope/unpublish', headers: asAdmin })
      expect(missing.statusCode).toBe(404)
    })
  })

  describe('user courses (minigolf.userCourses.enabled)', () => {
    const asOwner = { 'x-user': 'owner' }
    const asOther = { 'x-user': 'other' }
    const asMod = { 'x-user': 'mod' }
    const content = (holeIds: string[], name = 'Mine') => ({ name, description: '', difficulty: 1 as const, holeIds })
    const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown) =>
      app().inject({ method, url, headers, payload: payload as object })

    beforeAll(async () => {
      await setupFlags(new Set(['minigolf.userCourses.enabled']))
    })
    afterAll(async () => {
      await setupFlags(new Set())
    })
    afterEach(async () => {
      await db.deleteFrom('user').where('id', 'like', 'gone-%').execute()
    })

    async function ownerCourse(published = false) {
      const hole = (await createHoleAs(asOwner, validHole('h'))).json()
      const course = (await createCourseAs(asOwner, content([hole.id]))).json()
      if (published) await call('POST', `/api/minigolf/courses/${course.id}/publish`, asOwner)
      return { hole, course }
    }

    it('makes a private course of the player, published it becomes public with the author name', async () => {
      const { hole, course } = await ownerCourse()
      expect(course).toMatchObject({ ownerUserId: 'owner', authorName: 'Olive Owner', visibility: 'private', published: null })
      expect(hole.ownerUserId).toBe('owner')

      const published = await call('POST', `/api/minigolf/courses/${course.id}/publish`, asOwner)
      expect(published.statusCode).toBe(200)
      expect(published.json()).toMatchObject({ visibility: 'public', authorName: 'Olive Owner', draft: null })

      const unpublished = await call('POST', `/api/minigolf/courses/${course.id}/unpublish`, asOwner)
      expect(unpublished.json()).toMatchObject({ visibility: 'private', published: null })
      expect(unpublished.json().draft).not.toBeNull()
    })

    it('shows others only public user courses, without the draft', async () => {
      const { course } = await ownerCourse(true)
      await call('PATCH', `/api/minigolf/courses/${course.id}`, asOwner, { version: 2, content: content([], 'Renamed draft') })
      const draftOnly = (await createCourseAs(asOwner, content([], 'Secret'))).json()

      for (const headers of [asOther, asMod]) {
        const list = (await call('GET', '/api/minigolf/courses', headers)).json().courses
        expect(list.map((c: { id: string }) => c.id)).toEqual([course.id])
        expect(list[0]).toMatchObject({ authorName: 'Olive Owner', visibility: 'public' })
        expect(list[0]).not.toHaveProperty('draft')
        expect((await call('GET', `/api/minigolf/courses/${draftOnly.id}`, headers)).statusCode).toBe(404)
      }
      const mine = (await call('GET', '/api/minigolf/courses', asOwner)).json().courses
      expect(mine.map((c: { id: string }) => c.id).sort()).toEqual([course.id, draftOnly.id].sort())
      expect(mine.find((c: { id: string }) => c.id === course.id).draft).toMatchObject({ name: 'Renamed draft' })
    })

    it('lets only the owner and admins write a course: anon 401, other and moderator 403 (404 on a private one)', async () => {
      const { course } = await ownerCourse(true)
      const priv = (await createCourseAs(asOwner, content([], 'Private'))).json()
      const writes = (id: string, headers: Record<string, string>) => [
        call('PATCH', `/api/minigolf/courses/${id}`, headers, { version: 1, content: content([]) }),
        call('POST', `/api/minigolf/courses/${id}/publish`, headers),
        call('POST', `/api/minigolf/courses/${id}/unpublish`, headers),
        call('POST', `/api/minigolf/courses/${id}/discard`, headers),
        call('DELETE', `/api/minigolf/courses/${id}`, headers),
      ]
      for (const r of await Promise.all(writes(course.id, {}))) expect(r.statusCode).toBe(401)
      for (const headers of [asOther, asMod]) for (const r of await Promise.all(writes(course.id, headers))) expect(r.statusCode).toBe(403)
      for (const headers of [asOther, asMod]) for (const r of await Promise.all(writes(priv.id, headers))) expect(r.statusCode).toBe(404)
      expect((await call('GET', `/api/minigolf/courses/${course.id}`, asOwner)).json().published).not.toBeNull()

      expect((await call('POST', `/api/minigolf/courses/${course.id}/unpublish`, asAdmin)).statusCode).toBe(200)
      expect((await call('DELETE', `/api/minigolf/courses/${course.id}`, asOwner)).statusCode).toBe(204)
      expect((await call('DELETE', `/api/minigolf/courses/${priv.id}`, asAdmin)).statusCode).toBe(204)
    })

    it('keeps players away from official courses and holes', async () => {
      const hole = (await createHoleAs(asAdmin, validHole('off'))).json()
      const official = (await createCourseAs(asAdmin, content([hole.id], 'Official'))).json()
      await call('POST', `/api/minigolf/courses/${official.id}/publish`, asAdmin)
      expect(official).toMatchObject({ ownerUserId: null, visibility: 'official', authorName: null })
      expect((await call('PATCH', `/api/minigolf/courses/${official.id}`, asOwner, { version: 1, content: content([]) })).statusCode).toBe(
        403,
      )
      expect((await call('DELETE', `/api/minigolf/holes/${hole.id}`, asOwner)).statusCode).toBe(403)
      expect((await call('PATCH', `/api/minigolf/holes/${hole.id}`, asOwner, { version: 1, hole: validHole(hole.id) })).statusCode).toBe(
        403,
      )
    })

    it('keeps a player to their own holes: list, read, write', async () => {
      const mine = (await createHoleAs(asOwner, validHole('m'))).json()
      const theirs = (await createHoleAs(asOther, validHole('t'))).json()
      expect((await call('GET', '/api/minigolf/holes', asOwner)).json().holes.map((h: { id: string }) => h.id)).toEqual([mine.id])
      expect((await call('GET', `/api/minigolf/holes/${theirs.id}`, asOwner)).statusCode).toBe(404)
      expect((await call('PATCH', `/api/minigolf/holes/${mine.id}`, asOther, { version: 1, hole: validHole(mine.id) })).statusCode).toBe(
        404,
      )
      expect((await call('GET', '/api/minigolf/holes', asAdmin)).json().holes).toHaveLength(2)
      expect((await call('DELETE', `/api/minigolf/holes/${mine.id}`, asOwner)).statusCode).toBe(204)
    })

    it('lets others read and copy a hole of a public course, never edit it or see its draft', async () => {
      const { hole } = await ownerCourse(true)
      await call('PATCH', `/api/minigolf/holes/${hole.id}`, asOwner, { version: 2, hole: validHole(hole.id, { name: 'Secret draft' }) })
      const read = (await call('GET', `/api/minigolf/holes/${hole.id}`, asOther)).json()
      expect(read).toMatchObject({ draft: null, published: { name: 'Straight' } })

      const copy = await call('POST', '/api/minigolf/holes', asOther, { copyOf: hole.id })
      expect(copy.statusCode).toBe(201)
      expect(copy.json()).toMatchObject({ ownerUserId: 'other', draft: { name: 'Straight (copy)' } })
    })

    it('refuses copying a hole nobody published', async () => {
      const { hole } = await ownerCourse()
      expect((await call('POST', '/api/minigolf/holes', asOther, { copyOf: hole.id })).statusCode).toBe(404)
    })

    it("refuses a player's course with holes that aren't theirs, on create and save", async () => {
      const { hole } = await ownerCourse(true)
      const official = (await createHoleAs(asAdmin, validHole('o'))).json()
      for (const id of [hole.id, official.id]) {
        const res = await call('POST', '/api/minigolf/courses', asOther, content([id]))
        expect(res.statusCode).toBe(400)
      }
      const own = (await createCourseAs(asOther, content([]))).json()
      const save = await call('PATCH', `/api/minigolf/courses/${own.id}`, asOther, { version: 1, content: content([hole.id]) })
      expect(save.statusCode).toBe(400)
    })

    it("runs the same publish checks on a player's course", async () => {
      const bad = (await createHoleAs(asOwner, validHole('bad', { cup: { at: [10000, 10000], r: 80 } }))).json()
      const course = (await createCourseAs(asOwner, content([bad.id]))).json()
      const res = await call('POST', `/api/minigolf/courses/${course.id}/publish`, asOwner)
      expect(res.statusCode).toBe(422)
      expect(res.json().problems[0].holeId).toBe(bad.id)
    })

    it('stops a player at the limits: courses, holes, public courses, holes per course', async () => {
      const hole = (await createHoleAs(asOwner, validHole('h'))).json()
      for (let i = 0; i < MINIGOLF_LIMITS.courses; i++) await createCourse(db, content([hole.id]), 'owner')
      const tooMany = await createCourseAs(asOwner, content([]))
      expect(tooMany.statusCode).toBe(409)
      expect(tooMany.json()).toEqual({ error: 'limit reached', limit: 'courses', max: MINIGOLF_LIMITS.courses })
      // Admins are not limited
      expect((await createCourseAs(asAdmin, content([]))).statusCode).toBe(201)

      const rows = await db.selectFrom('minigolf_courses').select('id').where('owner_user_id', '=', 'owner').execute()
      for (const { id } of rows.slice(0, MINIGOLF_LIMITS.published)) {
        expect((await call('POST', `/api/minigolf/courses/${id}/publish`, asOwner)).statusCode).toBe(200)
      }
      const sixth = await call('POST', `/api/minigolf/courses/${rows[MINIGOLF_LIMITS.published].id}/publish`, asOwner)
      expect(sixth.statusCode).toBe(409)
      expect(sixth.json()).toMatchObject({ limit: 'published' })
      // Publishing an already public course again is not a new one
      expect((await call('POST', `/api/minigolf/courses/${rows[0].id}/publish`, asOwner)).statusCode).toBe(200)

      const own = (await createCourseAs(asOther, content([]))).json()
      const ids = Array.from({ length: MINIGOLF_LIMITS.courseHoles + 1 }, (_, i) => `x${i}`)
      for (const id of ids) await createHole(db, validHole(id), 'other')
      const long = await call('PATCH', `/api/minigolf/courses/${own.id}`, asOther, { version: 1, content: content(ids) })
      expect(long.json()).toMatchObject({ limit: 'courseHoles' })

      for (let i = ids.length; i < MINIGOLF_LIMITS.holes; i++) await createHole(db, validHole(`y${i}`), 'other')
      const full = await createHoleAs(asOther, validHole('z'))
      expect(full.statusCode).toBe(409)
      expect(full.json()).toMatchObject({ limit: 'holes' })
    })

    it('hides and refuses user courses while the flag is off for the player; admins still work', async () => {
      const { course } = await ownerCourse(true)
      await setupFlags(new Set())
      try {
        expect((await call('GET', '/api/minigolf/courses', asOther)).json().courses).toEqual([])
        expect((await call('GET', `/api/minigolf/courses/${course.id}`, asOther)).statusCode).toBe(404)
        expect((await createCourseAs(asOwner, content([]))).statusCode).toBe(403)
        expect((await call('PATCH', `/api/minigolf/courses/${course.id}`, asOwner, { version: 1, content: content([]) })).statusCode).toBe(
          404,
        )
        expect((await call('GET', '/api/minigolf/courses', asAdmin)).json().courses).toHaveLength(1)
        expect((await createCourseAs(asAdmin, content([]))).statusCode).toBe(201)
      } finally {
        await setupFlags(new Set(['minigolf.userCourses.enabled']))
      }
    })

    it('lists exactly the courses canReadCourse allows, for every viewer', async () => {
      const off = await createHole(db, validHole('p1'), 'owner')
      await createCourse(db, content([off.id]), 'owner')
      await ownerCourse(true)
      const hole = (await createHoleAs(asAdmin, validHole('off'))).json()
      const official = (await createCourseAs(asAdmin, content([hole.id], 'Off'))).json()
      await call('POST', `/api/minigolf/courses/${official.id}/publish`, asAdmin)
      await createCourseAs(asAdmin, content([], 'Official draft'))
      const all = await listCourses(db, { id: 'admin', admin: true, userCourses: true })
      for (const viewer of [
        { id: 'owner', admin: false, userCourses: true },
        { id: 'owner', admin: false, userCourses: false },
        { id: 'other', admin: false, userCourses: true },
        { id: 'other', admin: false, userCourses: false },
        { id: 'admin', admin: true, userCourses: false },
      ]) {
        const listed = (await listCourses(db, viewer)).map(c => c.id).sort()
        expect(listed).toEqual(
          all
            .filter(c => canReadCourse(c, viewer))
            .map(c => c.id)
            .sort(),
        )
      }
    })

    it("keeps a hole no more visible than its course: with the flag off even the owner's own hole is hidden", async () => {
      const { hole } = await ownerCourse()
      await setupFlags(new Set())
      try {
        expect((await call('GET', `/api/minigolf/holes/${hole.id}`, asOwner)).statusCode).toBe(404)
        expect((await call('POST', '/api/minigolf/holes', asOwner, { copyOf: hole.id })).statusCode).toBe(403)
      } finally {
        await setupFlags(new Set(['minigolf.userCourses.enabled']))
      }
    })

    it("refuses a player's hole in an official course", async () => {
      const { hole } = await ownerCourse()
      const res = await createCourseAs(asAdmin, content([hole.id], 'Official'))
      expect(res.statusCode).toBe(400)
    })

    it("takes a deleted account's courses and holes with it", async () => {
      await db
        .insertInto('user')
        .values({ id: 'gone-1', name: 'Gone', email: 'gone@example.com', emailVerified: false, image: null, role: null })
        .execute()
      const hole = await createHole(db, validHole('gh'), 'gone-1')
      await createCourse(db, content([hole.id]), 'gone-1')
      await db.deleteFrom('user').where('id', '=', 'gone-1').execute()
      expect(await db.selectFrom('minigolf_courses').select('id').where('owner_user_id', '=', 'gone-1').execute()).toEqual([])
      expect(await db.selectFrom('minigolf_holes').select('id').where('owner_user_id', '=', 'gone-1').execute()).toEqual([])
    })
  })

  it('401s without a session', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/minigolf/courses' })
    expect(res.statusCode).toBe(401)
  })
})
