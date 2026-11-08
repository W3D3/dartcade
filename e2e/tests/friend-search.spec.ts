import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

// The Friends page's one search field: friends first, people from 3 characters, the keyboard on a combobox.
// Three fresh players: me, my friend (found under "Your friends") and a stranger (under "People on Dartcade").
const PASSWORD = 'TestPass1!'

async function player(browser: Browser, baseURL: string, name: string): Promise<Page> {
  const page = await (await browser.newContext({ baseURL })).newPage()
  const headers = { Origin: baseURL }
  const email = `${name}@test.local`
  await page.request.post('/api/auth/sign-up/email', { data: { name, email, password: PASSWORD, acceptTerms: true }, headers })
  const res = await page.request.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD }, headers })
  expect(res.ok(), `sign-in ${name}: ${res.status()}`).toBeTruthy()
  return page
}

test('searching: states, keyboard, adding with undo', async ({ browser, baseURL }) => {
  const tag = Date.now().toString(36)
  const [me, friend, stranger] = [`fm${tag}`, `ff${tag}`, `fs${tag}`]
  const [mine, theirs] = [await player(browser, baseURL!, me), await player(browser, baseURL!, friend)]
  await player(browser, baseURL!, stranger)
  const asked = await mine.request.post('/api/friends/requests', { data: { name: friend }, headers: { Origin: baseURL! } })
  const { id } = (await asked.json()) as { id: string }
  expect((await theirs.request.post(`/api/friends/requests/${id}/accept`, { headers: { Origin: baseURL! } })).ok()).toBeTruthy()

  await mine.goto('/#/friends')
  const field = mine.getByRole('combobox', { name: 'Search friends or find people' })
  const people = mine.getByRole('group', { name: 'People on Dartcade' })

  // Empty and too short
  await field.click()
  await expect(mine.getByText('Search by name, or paste an exact email address.')).toBeVisible()
  await field.fill(tag.slice(0, 2))
  await expect(mine.getByText('Type 1 more letter')).toBeVisible()

  // Typing: my friend answers from the list, the stranger from the server
  await field.fill(tag)
  await expect(mine.getByRole('group', { name: 'Your friends' }).getByText(friend, { exact: true })).toBeVisible()
  await expect(people.getByText(stranger, { exact: true })).toBeVisible()

  // The arrow keys move over the rows; Enter does what the row offers
  await field.press('ArrowDown')
  await expect(mine.getByRole('option', { name: new RegExp(stranger) })).toHaveAttribute('data-highlighted', '')
  await field.press('Enter')
  await expect(people.getByText('Request sent')).toBeVisible()
  await expect(field).toHaveValue(tag)
  await expect(mine.getByRole('status').filter({ hasText: `Request sent to ${stranger}` })).toBeVisible()

  // Undo takes it back
  await mine.getByRole('button', { name: 'Undo' }).click()
  await expect(mine.getByRole('status').filter({ hasText: `Request sent to ${stranger}` })).toHaveCount(0)
  const list = await (await mine.request.get('/api/friends')).json()
  expect((list as { outgoing: unknown[] }).outgoing).toHaveLength(0)

  // Escape closes the list, then clears the field
  await field.click()
  await expect(people).toBeVisible()
  await field.press('Escape')
  await expect(people).toHaveCount(0)
  await field.press('Escape')
  await expect(field).toHaveValue('')

  // No results
  await field.fill('zzzqqq')
  await expect(mine.getByText('No players found for “zzzqqq”')).toBeVisible()

  // A failing search says so, keeps the friends, and Retry asks again
  let failing = true
  await mine.route('**/api/friends/search*', route =>
    failing ? route.fulfill({ status: 500, json: { error: 'boom' } }) : route.continue(),
  )
  await field.fill(tag)
  await expect(mine.getByText('Couldn’t search right now')).toBeVisible()
  await expect(mine.getByRole('group', { name: 'Your friends' })).toBeVisible()
  failing = false
  await mine.getByRole('button', { name: 'Retry' }).click()
  await expect(people.getByText(stranger, { exact: true })).toBeVisible()
})
