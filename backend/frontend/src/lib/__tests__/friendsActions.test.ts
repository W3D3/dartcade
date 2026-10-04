import { describe, it, expect, vi, beforeEach } from 'vitest'

const POST = vi.fn()
vi.mock('$lib/api', () => ({ api: { POST: (...args: unknown[]) => POST(...args) } }))
const { joinFriend, sendRequest } = await import('../friends/actions.js')

const reply = (status: number, body?: object) => status < 300
  ? { data: body ?? {}, error: undefined, response: { status } }
  : { data: undefined, error: body, response: { status } }

beforeEach(() => { POST.mockReset() })

describe('joinFriend', () => {
  it('joins without a code', async () => {
    POST.mockResolvedValue(reply(200, { id: 'l1' }))
    expect(await joinFriend('l1')).toEqual({ kind: 'joined' })
    expect(POST).toHaveBeenCalledWith('/api/lobbies/{id}/join', { params: { path: { id: 'l1' } }, body: {} })
  })
  it('asks before leaving the lobby you are in', async () => {
    POST.mockResolvedValue(reply(409, { error: 'x', code: 'in_lobby', lobbyId: 'mine' }))
    expect(await joinFriend('l1')).toEqual({ kind: 'switch', from: 'mine' })
  })
  it('says why a stale Join was refused', async () => {
    POST.mockResolvedValue(reply(403, { error: "Only the host's friends can join without the code" }))
    expect(await joinFriend('l1')).toEqual({ kind: 'refused', text: "You can't join that lobby without its code any more" })
    POST.mockResolvedValue(reply(404, { error: 'lobby not found' }))
    expect(await joinFriend('l1')).toEqual({ kind: 'refused', text: 'That lobby has closed' })
  })
})

describe('sendRequest', () => {
  it('asks for a name before sending anything', async () => {
    expect(await sendRequest('  @ ')).toEqual({ ok: false, text: 'Type their name' })
    expect(POST).not.toHaveBeenCalled()
  })
  it('sends the name without the @', async () => {
    POST.mockResolvedValue(reply(201, { status: 'requested' }))
    expect(await sendRequest('@sam.180')).toEqual({ ok: true, text: 'Request sent to @sam.180' })
    expect(POST).toHaveBeenCalledWith('/api/friends/requests', { body: { name: 'sam.180' } })
  })
})
