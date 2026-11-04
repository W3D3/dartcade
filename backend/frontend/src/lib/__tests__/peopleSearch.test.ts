import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const searchPeople = vi.hoisted(() => vi.fn())
const loadSuggestions = vi.hoisted(() => vi.fn())
vi.mock('../friends/actions', () => ({ searchPeople, loadSuggestions }))

import { createPeopleSearch } from '../friends/peopleSearch.svelte'

const hit = (name: string) => ({ id: name, name, avatar: { kind: 'none' as const }, mutualFriends: 0, request: 'none' as const })
const flush = () => vi.advanceTimersByTimeAsync(300)

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('createPeopleSearch', () => {
  it('asks nothing until 3 characters, and says so', async () => {
    const s = createPeopleSearch()
    s.search('')
    expect(s.phase).toBe('idle')
    s.search('@ma')
    expect(s.phase).toBe('short')
    await flush()
    expect(searchPeople).not.toHaveBeenCalled()
  })

  it('waits for typing to pause, then shows the people', async () => {
    searchPeople.mockResolvedValue({ users: [hit('Mara')] })
    const s = createPeopleSearch()
    s.search('mar')
    s.search('mara')
    expect(s.phase).toBe('loading')
    expect(searchPeople).not.toHaveBeenCalled()
    await flush()
    expect(searchPeople).toHaveBeenCalledOnce()
    expect(searchPeople).toHaveBeenCalledWith('mara')
    expect(s.phase).toBe('ready')
    expect(s.people.map(p => p.name)).toEqual(['Mara'])
  })

  it('drops an answer that arrives after a newer search started', async () => {
    let late!: (v: unknown) => void
    searchPeople.mockImplementationOnce(() => new Promise(r => (late = r)))
    searchPeople.mockResolvedValueOnce({ users: [hit('Marta')] })
    const s = createPeopleSearch()
    s.search('mar')
    await flush()
    s.search('mart')
    await flush()
    late({ users: [hit('Mara')] })
    await flush()
    expect(s.people.map(p => p.name)).toEqual(['Marta'])
  })

  it('clears the people when the text gets short again, even if an answer was on its way', async () => {
    let late!: (v: unknown) => void
    searchPeople.mockImplementationOnce(() => new Promise(r => (late = r)))
    const s = createPeopleSearch()
    s.search('mar')
    await flush()
    s.search('ma')
    late({ users: [hit('Mara')] })
    await flush()
    expect(s.phase).toBe('short')
    expect(s.people).toEqual([])
  })

  it('tells a failure from the rate limit', async () => {
    const s = createPeopleSearch()
    searchPeople.mockResolvedValueOnce({ error: 'failed' })
    s.search('mar')
    await flush()
    expect(s.phase).toBe('error')
    searchPeople.mockResolvedValueOnce({ error: 'rate' })
    s.search('mara')
    await flush()
    expect(s.phase).toBe('limited')
  })

  it('loads suggestions, and shows none when that fails', async () => {
    const s = createPeopleSearch()
    loadSuggestions.mockResolvedValueOnce({ users: [hit('Jonas')] })
    await s.suggest()
    expect(s.suggestions.map(p => p.name)).toEqual(['Jonas'])
    loadSuggestions.mockResolvedValueOnce({ error: 'failed' })
    await s.suggest()
    expect(s.suggestions).toEqual([])
  })

  it('shows what the user just did until the server answers, then trusts the server', async () => {
    searchPeople.mockResolvedValue({ users: [hit('Mara')] })
    const s = createPeopleSearch()
    s.search('mar')
    await flush()
    const [mara] = s.people
    expect(s.stateOf(mara)).toBe('none')
    s.mark(mara.id, 'sent')
    expect(s.stateOf(mara)).toBe('sent')
    s.search('mara')
    await flush()
    expect(s.stateOf(s.people[0])).toBe('none')
  })

  it('keeps what the user just did when a slower suggestions answer lands', async () => {
    let late!: (v: unknown) => void
    loadSuggestions.mockImplementationOnce(() => new Promise(r => (late = r)))
    const s = createPeopleSearch()
    const pending = s.suggest()
    s.mark('Mara', 'sent')
    late({ users: [hit('Mara')] })
    await pending
    expect(s.stateOf(s.suggestions[0])).toBe('sent')
  })
})
