import '../test/authByHeader.js'
import { useDbSingleton } from '../test/db.js'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertUsers } from '../test/fixtures.js'
import { moderatorRemove, moderatorUnpublish } from '../db/minigolfModeration.js'
import { createFastify } from './fastify.js'
import { minigolfCoursesApiPlugin } from './minigolfCourses.js'
import { minigolfModerationApiPlugin } from './minigolfModeration.js'
import { setupFlags } from '../flags/index.js'
import type { Hole } from '../shared/minigolf/types.js'

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

describe.skipIf(!process.env.TEST_DATABASE_URL)('minigolf user course browsing and moderation', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const asOwner = { 'x-user': 'owner' }
  const asOther = { 'x-user': 'other' }
  const asMod = { 'x-user': 'mod' }
  const asAdmin = { 'x-user': 'admin' }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('minigolf_moderation_api_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'admin', name: 'Admin', role: 'admin' },
      { id: 'owner', name: 'Olive Owner' },
      { id: 'other', name: 'Otto Other' },
      { id: 'mod', name: 'Mo Mod', role: 'moderator' },
    ])
    await setupFlags(new Set(['minigolf.userCourses.enabled']))
  })
  afterAll(async () => {
    await setupFlags(new Set())
    await close()
  })
  afterEach(async () => {
    await db.deleteFrom('minigolf_courses').execute()
    await db.deleteFrom('minigolf_holes').execute()
    await db.deleteFrom('admin_audit').execute()
  })

  function app() {
    const a = createFastify()
    a.register(minigolfCoursesApiPlugin, { db })
    a.register(minigolfModerationApiPlugin, { db })
    return a
  }
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) =>
    app().inject({ method, url, headers, payload: payload as object })

  async function publishedCourse(name = 'Olive Links') {
    const hole = (await call('POST', '/api/minigolf/holes', asOwner, { hole: validHole('h') })).json()
    const course = (
      await call('POST', '/api/minigolf/courses', asOwner, { name, description: '', difficulty: 2, holeIds: [hole.id] })
    ).json()
    const res = await call('POST', `/api/minigolf/courses/${course.id}/publish`, asOwner)
    expect(res.statusCode).toBe(200)
    return course.id as string
  }

  describe('browse', () => {
    it('lists published user courses with author, hole count, plays and a thumbnail, and searches by name', async () => {
      const id = await publishedCourse()
      await db
        .insertInto('game_sessions')
        .values([
          { id: 'g1', game_id: 'minigolf', config: JSON.stringify({ course: id }), status: 'finished' },
          { id: 'g2', game_id: 'minigolf', config: JSON.stringify({ course: 'greenhorn' }), status: 'finished' },
        ])
        .execute()
      const all = await call('GET', '/api/minigolf/browse', asOther)
      expect(all.statusCode).toBe(200)
      expect(all.json().courses).toEqual([
        expect.objectContaining({
          id,
          name: 'Olive Links',
          authorName: 'Olive Owner',
          holeCount: 1,
          plays: 1,
          thumbnail: expect.objectContaining({ name: 'Straight' }),
        }),
      ])
      expect((await call('GET', '/api/minigolf/browse?search=LINKS', asOther)).json().courses).toHaveLength(1)
      expect((await call('GET', '/api/minigolf/browse?search=nope', asOther)).json().courses).toEqual([])
      expect((await call('GET', '/api/minigolf/browse?search=%25', asOther)).json().courses).toEqual([])
      await db.deleteFrom('game_sessions').execute()
    })

    it('leaves out drafts, unpublished courses and official ones, and needs the flag', async () => {
      const id = await publishedCourse()
      await call('POST', `/api/minigolf/courses/${id}/unpublish`, asOwner)
      expect((await call('GET', '/api/minigolf/browse', asOther)).json().courses).toEqual([])
      await setupFlags(new Set())
      expect((await call('GET', '/api/minigolf/browse', asOther)).statusCode).toBe(403)
      await setupFlags(new Set(['minigolf.userCourses.enabled']))
    })
  })

  describe('reports', () => {
    it('are filed once per person, not on your own or an unpublished course', async () => {
      const id = await publishedCourse()
      const report = (headers: Record<string, string>, reason = 'Offensive name') =>
        call('POST', `/api/minigolf/courses/${id}/report`, headers, { reason })
      expect((await report(asOther)).statusCode).toBe(204)
      expect((await report(asOther)).statusCode).toBe(409)
      expect((await report(asOwner)).statusCode).toBe(409)
      expect((await report(asMod, '   ')).statusCode).toBe(400)
      expect((await call('POST', '/api/minigolf/courses/nope/report', asOther, { reason: 'x' })).statusCode).toBe(404)
      await call('POST', `/api/minigolf/courses/${id}/unpublish`, asOwner)
      expect((await report(asMod)).statusCode).toBe(404)
    })

    it('show to moderators and admins, not to players', async () => {
      const id = await publishedCourse()
      await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Rude' })
      await call('POST', `/api/minigolf/courses/${id}/report`, asAdmin, { reason: 'Also rude' })
      expect((await call('GET', '/api/admin/minigolf/reports', asOther)).statusCode).toBe(403)
      for (const who of [asMod, asAdmin]) {
        const res = await call('GET', '/api/admin/minigolf/reports', who)
        expect(res.statusCode).toBe(200)
        expect(res.json().courses).toHaveLength(1)
        expect(res.json().courses[0].course.id).toBe(id)
        expect(res.json().courses[0].reports.map((r: { reporterName: string }) => r.reporterName)).toEqual(['Otto Other', 'Admin'])
      }
    })

    it('dismissing closes them and is audited', async () => {
      const id = await publishedCourse()
      await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Rude' })
      expect((await call('POST', `/api/admin/minigolf/courses/${id}/dismiss-reports`, asMod)).statusCode).toBe(204)
      expect((await call('GET', '/api/admin/minigolf/reports', asMod)).json().courses).toEqual([])
      // A dismissed report is closed: the same person may report the course again
      expect((await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Changed' })).statusCode).toBe(204)
      expect((await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Again' })).statusCode).toBe(409)
      expect((await call('POST', `/api/admin/minigolf/courses/${id}/dismiss-reports`, asMod)).statusCode).toBe(204)
      expect(await db.selectFrom('admin_audit').select(['action', 'target', 'admin_user_id']).execute()).toEqual([
        { action: 'minigolf.dismiss', target: id, admin_user_id: 'mod' },
        { action: 'minigolf.dismiss', target: id, admin_user_id: 'mod' },
      ])
    })
  })

  describe('moderation', () => {
    it('unpublish needs a reason, tells the author why, blocks Publish until allowed, and is audited', async () => {
      const id = await publishedCourse()
      await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Rude' })
      const unpublish = (headers: Record<string, string>, reason?: string) =>
        call('POST', `/api/admin/minigolf/courses/${id}/unpublish`, headers, { reason })
      expect((await unpublish(asOther, 'x')).statusCode).toBe(403)
      expect((await unpublish(asMod, '  ')).statusCode).toBe(400)
      expect((await unpublish(asMod, 'Offensive name')).statusCode).toBe(204)

      const mine = (await call('GET', `/api/minigolf/courses/${id}`, asOwner)).json()
      expect(mine).toMatchObject({ visibility: 'private', published: null, moderation: { reason: 'Offensive name' } })
      expect(await call('GET', `/api/minigolf/courses/${id}`, asOther)).toMatchObject({ statusCode: 404 })
      const listed = (await call('GET', '/api/admin/minigolf/reports', asMod)).json()
      expect(listed.courses).toEqual([])
      expect(listed.moderated).toEqual([
        expect.objectContaining({ id, name: 'Olive Links', authorName: 'Olive Owner', reason: 'Offensive name' }),
      ])

      const again = await call('POST', `/api/minigolf/courses/${id}/publish`, asOwner)
      expect(again.statusCode).toBe(422)
      expect(JSON.stringify(again.json())).toContain('Offensive name')

      expect((await call('POST', `/api/admin/minigolf/courses/${id}/allow`, asMod)).statusCode).toBe(204)
      expect((await call('GET', '/api/admin/minigolf/reports', asMod)).json().moderated).toEqual([])
      expect((await call('POST', `/api/minigolf/courses/${id}/publish`, asOwner)).statusCode).toBe(200)
      const actions = await db.selectFrom('admin_audit').select(['action', 'detail']).orderBy('id').execute()
      expect(actions.map(a => a.action)).toEqual(['minigolf.unpublish', 'minigolf.allow'])
      expect(actions[0]?.detail).toMatchObject({ ownerId: 'owner', reason: 'Offensive name' })
    })

    it('remove deletes the course and keeps the reason in the audit log; official courses are not touched', async () => {
      const id = await publishedCourse()
      expect((await call('POST', `/api/admin/minigolf/courses/${id}/remove`, asAdmin, {})).statusCode).toBe(400)
      expect((await call('POST', `/api/admin/minigolf/courses/${id}/remove`, asAdmin, { reason: 'Spam' })).statusCode).toBe(204)
      expect((await call('GET', `/api/minigolf/courses/${id}`, asOwner)).statusCode).toBe(404)
      expect(await db.selectFrom('admin_audit').select(['action', 'detail']).execute()).toEqual([
        { action: 'minigolf.remove', detail: { ownerId: 'owner', name: 'Olive Links', reason: 'Spam' } },
      ])

      const hole = (await call('POST', '/api/minigolf/holes', asAdmin, { hole: validHole('o') })).json()
      const official = (
        await call('POST', '/api/minigolf/courses', asAdmin, { name: 'Off', description: '', difficulty: 1, holeIds: [hole.id] })
      ).json()
      expect((await call('POST', `/api/admin/minigolf/courses/${official.id}/remove`, asAdmin, { reason: 'x' })).statusCode).toBe(404)
    })
  })

  it('changes nothing when the audit row cannot be written', async () => {
    const id = await publishedCourse()
    await call('POST', `/api/minigolf/courses/${id}/report`, asOther, { reason: 'Rude' })
    // An admin id with no account fails admin_audit's foreign key
    await expect(moderatorUnpublish(db, 'nobody', id, 'x')).rejects.toThrow()
    await expect(moderatorRemove(db, 'nobody', id, 'x')).rejects.toThrow()
    expect((await call('GET', '/api/minigolf/browse', asOther)).json().courses).toHaveLength(1)
    expect((await call('GET', '/api/admin/minigolf/reports', asMod)).json().courses).toHaveLength(1)
  })

  describe('course texts', () => {
    it('are trimmed, kept short and free of control characters; a nameless course cannot be published', async () => {
      const make = (name: string, description = '') =>
        call('POST', '/api/minigolf/courses', asOwner, { name, description, difficulty: 1, holeIds: [] })
      const ok = await make('  Spaced  ')
      expect(ok.json().draft.name).toBe('Spaced')
      expect((await make('x'.repeat(41))).statusCode).toBe(400)
      expect((await make('ok', 'y'.repeat(281))).statusCode).toBe(400)
      expect((await make('bad\u0007name')).statusCode).toBe(400)
      const badDescription = await make('ok', 'bad\u0007text')
      expect(badDescription.statusCode).toBe(400)
      expect(JSON.stringify(badDescription.json())).toContain('body/description')

      const hole = (await call('POST', '/api/minigolf/holes', asOwner, { hole: validHole('n') })).json()
      const nameless = (
        await call('POST', '/api/minigolf/courses', asOwner, { name: '', description: '', difficulty: 1, holeIds: [hole.id] })
      ).json()
      expect((await call('POST', `/api/minigolf/courses/${nameless.id}/publish`, asOwner)).statusCode).toBe(422)
    })
  })
})
