import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionSchema, StepSchema, type Step } from '$shared/missions/types'
import { OFFICIAL_MISSIONS } from '$shared/missions/official'
import { stepTitle } from '$shared/missions/describe'
import {
  clearDraft,
  cycleTarget,
  duplicateStep,
  checkedSteps,
  formErrors,
  formSnapshot,
  fromMission,
  keyed,
  moveStep,
  newStep,
  newStepErrors,
  PRESETS,
  readDraft,
  saveMission,
  shiftStep,
  STEP_TYPES,
  stepErrors,
  stepHelp,
  storeDraft,
  toComplete,
  toMission,
  type BuilderForm,
} from './builder'

const { PUT, POST } = vi.hoisted(() => ({ PUT: vi.fn(), POST: vi.fn() }))
vi.mock('$lib/api', () => ({ api: { PUT, POST } }))

const gauntlet = OFFICIAL_MISSIONS.find(m => m.id === 'official-tungsten-gauntlet')!.mission
const form = (over: Partial<BuilderForm> = {}): BuilderForm => ({ ...fromMission(gauntlet, 'friends', false), ...over })

describe('the form and the mission', () => {
  it('round-trips a mission', () => {
    expect(toMission(form())).toEqual(gauntlet)
  })

  it('reads a time limit as a preset or as minutes and seconds of its own', () => {
    expect(form().limit).toBe(900)
    const custom = fromMission({ ...gauntlet, timeLimit: 750 }, 'friends', false)
    expect(custom).toMatchObject({ limit: 'custom', customMinutes: 12, customSeconds: 30 })
    expect(toMission(custom).timeLimit).toBe(750)
    expect('timeLimit' in toMission({ ...custom, limit: 'none' })).toBe(false)
  })
})

describe('new steps and presets', () => {
  it.each(STEP_TYPES.map(t => t.type))('a new %s step is a valid step', type => {
    expect(StepSchema.safeParse(newStep(type)).success).toBe(true)
  })

  it('every preset is a valid step and reads as its label says', () => {
    for (const p of [...PRESETS.hit, ...PRESETS.marks, ...PRESETS.visits]) expect(StepSchema.safeParse(p.step).success, p.label).toBe(true)
    expect(PRESETS.hit.map(p => stepTitle(p.step))).toEqual([
      'S20, D20, T20 in one visit',
      'Hit 5 bulls',
      'Hit every double once',
      '1–20 + Bull',
      'Hit T20 3 times in a row',
    ])
    expect(PRESETS.marks.map(p => stepTitle(p.step))).toEqual([
      '5 marks on 20 in 4 darts',
      'Close 15–20 + Bull',
      '9 marks on 20 in 3 darts',
    ])
  })
})

describe('target chips', () => {
  it('cycle single, double, treble, any segment; the bull outer and inner', () => {
    const seen = ['S20']
    for (let i = 0; i < 4; i++) seen.push(cycleTarget(seen.at(-1)!))
    expect(seen).toEqual(['S20', 'D20', 'T20', '20', 'S20'])
    expect(cycleTarget('B')).toBe('DB')
    expect(cycleTarget('DB')).toBe('B')
  })
})

describe('reordering', () => {
  const steps = () => [newStep('checkout'), newStep('hit'), newStep('leg')].map(keyed)

  it('drops a step before another or at the end', () => {
    const s = steps()
    const [a, b, c] = s.map(x => x.key)
    expect(moveStep(s, c, a).map(x => x.key)).toEqual([c, a, b])
    expect(moveStep(s, a, null).map(x => x.key)).toEqual([b, c, a])
    expect(moveStep(s, a, a)).toBe(s)
  })

  it('moves a step one place with the keyboard, staying put at an end', () => {
    const s = steps()
    const [a, b, c] = s.map(x => x.key)
    expect(shiftStep(s, b, -1).map(x => x.key)).toEqual([b, a, c])
    expect(shiftStep(s, c, 1)).toBe(s)
  })

  it('duplicates a step right after itself, as a copy', () => {
    const s = steps()
    const out = duplicateStep(s, s[0].key)
    expect(out.map(x => x.step.type)).toEqual(['checkout', 'checkout', 'hit', 'leg'])
    expect(out[1].key).not.toBe(out[0].key)
    ;(out[1].step as { start: number }).start = 40
    expect((out[0].step as { start: number }).start).toBe(121)
  })
})

describe('checks', () => {
  it('has none for a valid mission', () => {
    expect(formErrors(form()).size).toBe(0)
  })

  it('names each field the shared schema refuses, by path', () => {
    const steps = form().steps
    const bad: Step = { type: 'checkout', start: 170, maxDarts: 2, finish: 'double' }
    const broken = form({
      name: '  ',
      steps: [{ ...steps[0], step: bad }, { ...steps[1], step: { ...newStep('score'), within: Number.NaN } as Step }, steps[2]],
    })
    const errors = formErrors(broken)
    expect(Object.fromEntries(errors)).toEqual({
      name: 'Must not be blank',
      'steps.0.start': 'Cannot be checked out in that many darts',
      'steps.1.within': 'Enter a number',
    })
    expect(Object.fromEntries(stepErrors(errors, 0))).toEqual({ start: 'Cannot be checked out in that many darts' })
    expect(checkedSteps(broken, errors)).toEqual([null, null, steps[2].step])
    expect(Object.fromEntries(newStepErrors(bad))).toEqual({ start: 'Cannot be checked out in that many darts' })
  })

  it('says the bounds a number is outside of, and asks for a step', () => {
    const e = formErrors(form({ steps: [keyed({ ...newStep('average'), visits: 100 } as Step)] }))
    expect(e.get('steps.0.visits')).toBe('At most 99')
    expect(formErrors(form({ steps: [] })).get('steps')).toBe('Add a step')
    expect(formErrors(form({ limit: 'custom', customMinutes: 0, customSeconds: 10 })).get('timeLimit')).toBe('At least 30')
  })

  it('agrees with the server on the artboard mission', () => {
    expect(MissionSchema.safeParse(toMission(form())).success).toBe(true)
  })
})

describe('words', () => {
  it('explains a streak, an order and the bull', () => {
    expect(stepHelp(gauntlet.steps[1])).toBe('In a row: any dart that misses S20 resets the count to 0. Inner or outer single both count.')
    expect(stepHelp(gauntlet.steps[2])).toBe(
      'A wrong dart in between doesn’t reset, but every dart counts toward the limit. Bull = outer or inner bull.',
    )
    expect(stepHelp(newStep('visits'))).toBe('A visit is 3 darts; a bust counts as 0. In a row: one visit below 41 resets the count.')
  })

  it('sums up what completes the mission', () => {
    expect(toComplete(gauntlet)).toEqual({
      lead: 'Finish all 3 steps in any order',
      time: '15:00',
      tail: 'A failed step can be retried on its own.',
    })
    expect(toComplete({ ...gauntlet, steps: [gauntlet.steps[0]], timeLimit: undefined, onFail: 'restart' })).toEqual({
      lead: 'Finish the step',
      time: null,
      tail: 'A failed step resets everything.',
    })
  })
})

describe('the kept draft', () => {
  beforeEach(() => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => items.set(k, v),
      removeItem: (k: string) => items.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const blank = { id: null, from: null }

  it('keeps a form on this device and reads it back', () => {
    storeDraft(blank, form())
    const back = readDraft(blank)!
    expect(formSnapshot(back)).toBe(formSnapshot(form()))
    clearDraft(blank)
    expect(readDraft(blank)).toBeNull()
  })

  it('keeps a copy apart from a blank new mission and from other copies', () => {
    storeDraft(blank, form({ name: 'Blank draft' }))
    storeDraft({ id: null, from: 'm-b' }, form({ name: 'Copy of B, changed' }))
    expect(readDraft({ id: null, from: 'm-b' })?.name).toBe('Copy of B, changed')
    expect(readDraft(blank)?.name).toBe('Blank draft')
    expect(readDraft({ id: null, from: 'm-c' })).toBeNull()
    expect(readDraft({ id: 'm-b', from: null })).toBeNull()
  })

  it('drops what does not read as a draft, and fills missing fields', () => {
    localStorage.setItem('mission-draft:new', 'not json')
    expect(readDraft(blank)).toBeNull()
    localStorage.setItem('mission-draft:m1', JSON.stringify({ name: 'Half', steps: [newStep('leg'), { type: 'nope' }] }))
    const half = readDraft({ id: 'm1', from: null })!
    expect(half.name).toBe('Half')
    expect(half.order).toBe('any')
    expect(half.steps.map(s => s.step.type)).toEqual(['leg'])
  })
})

describe('saving', () => {
  afterEach(() => vi.clearAllMocks())
  const card = { id: 'm1' }

  it('creates a mission with its visibility, or an official one', async () => {
    POST.mockResolvedValue({ data: card, response: { status: 201 } })
    expect(await saveMission(form(), null)).toEqual({ ok: card })
    expect(POST).toHaveBeenLastCalledWith('/api/missions', { body: { mission: gauntlet, visibility: 'friends' } })
    await saveMission(form({ official: true }), null)
    expect(POST).toHaveBeenLastCalledWith('/api/admin/missions', { body: { mission: gauntlet } })
  })

  it('updates the mission being edited', async () => {
    PUT.mockResolvedValue({ data: card, response: { status: 200 } })
    await saveMission(form({ visibility: 'public' }), 'm1')
    expect(PUT).toHaveBeenCalledWith('/api/missions/{id}', {
      params: { path: { id: 'm1' } },
      body: { mission: gauntlet, visibility: 'public' },
    })
  })

  it("maps the server's field errors onto the form's paths, and says when the cap is reached", async () => {
    POST.mockResolvedValue({
      error: { error: 'invalid request', details: [{ path: 'body/mission/steps/2/within', message: 'needs more hits than darts' }] },
      response: { status: 400 },
    })
    const res = await saveMission(form(), null)
    expect(res).toEqual({ error: 'Some fields need a look.', fields: new Map([['steps.2.within', 'Needs more hits than darts']]) })
    POST.mockResolvedValue({ error: { error: 'limit reached' }, response: { status: 409 } })
    expect(await saveMission(form(), null)).toMatchObject({ error: expect.stringContaining('Delete one') })
  })
})
