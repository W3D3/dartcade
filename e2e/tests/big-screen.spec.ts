import { createHash } from 'crypto'
import { test, expect, psql } from '../fixtures/auth.js'

/** Pairs a board straight in the e2e database: the stack has no bridge to pair with. */
function insertBoard(ownerEmail: string, id: string, name: string, bigScreenToken = 'unused'): void {
  const bsHash = createHash('sha256').update(bigScreenToken).digest('hex')
  psql(
    `INSERT INTO boards (id, owner_user_id, name, token_hash, big_screen_mode, big_screen_token_hash) SELECT '${id}', id, '${name}', 'hash-${id}', 'manual', '${bsHash}' FROM "user" WHERE email = '${ownerEmail}'`,
  )
}

function deleteBoard(id: string): void {
  psql(`DELETE FROM boards WHERE id = '${id}'`)
}

// bigscreen.enabled defaults to admins, so the e2e admin has it without FLAGS_ON. There is no
// bridge here, so the board is offline and no game can sit on it: only the idle screen is checked.
// The board is deleted again: the worker's admin is shared by later specs, which assume it owns none.
test('the big screen of an own board shows the idle screen, view-only', async ({ adminPage: page }, testInfo) => {
  const id = `e2e-bs-${testInfo.parallelIndex}-${Date.now().toString(36)}`
  insertBoard(`e2e-admin-${testInfo.parallelIndex}@test.local`, id, 'Big Board')

  try {
    await page.goto(`/#/big-screen/${id}`)
    await expect(page.getByText('Big Board')).toBeVisible()
    await expect(page.getByText('Board offline')).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
  } finally {
    deleteBoard(id)
  }
})

// The kiosk has no session: it opens the page with the token in the URL, in a browser without cookies.
test('the kiosk opens with its token, drops it from the URL, and stops when it is wrong', async ({
  browser,
  adminPage: _admin, // only for its side effect: the admin user the board is paired to exists
}, testInfo) => {
  const id = `e2e-bk-${testInfo.parallelIndex}-${Date.now().toString(36)}`
  const known = 'ab'.repeat(32)
  insertBoard(`e2e-admin-${testInfo.parallelIndex}@test.local`, id, 'Kiosk Board', known)
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(`/#/big-screen/${id}?k=${known}`)
    await expect(page.getByText('Board offline')).toBeVisible()
    await expect(page).not.toHaveURL(/k=/)
    await expect(page).not.toHaveURL(/\/login/)

    const wrong = await context.newPage()
    await wrong.goto(`/#/big-screen/${id}?k=${'cd'.repeat(32)}`)
    await expect(wrong.getByText('Stopped')).toBeVisible()
    await expect(wrong).not.toHaveURL(/\/login/)
  } finally {
    await context.close()
    deleteBoard(id)
  }
})
