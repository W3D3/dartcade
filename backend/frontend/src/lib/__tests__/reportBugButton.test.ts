import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import ReportBugButton from '../components/feedback/ReportBugButton.svelte'
import { hideSkipped, SCREENSHOT_SKIP_ATTR } from '../feedback/report'

const info = vi.hoisted(() => ({ feedback: true }))
const user = vi.hoisted(() => ({ value: { id: 'u1' } }))

vi.mock('$lib/authInfo', async () => ({ authInfo: (await import('svelte/store')).readable(info) }))
vi.mock('$lib/auth', async () => ({ currentUser: (await import('svelte/store')).readable(user.value) }))
vi.mock('$lib/feedback/report', async importOriginal => ({
  ...(await importOriginal<typeof import('../feedback/report')>()),
  openFeedback: vi.fn(),
}))

describe('ReportBugButton', () => {
  it('is a labelled button that the screenshot skips', () => {
    const { body } = render(ReportBugButton)
    expect(body).toContain('aria-label="Report a bug"')
    expect(body).toContain(SCREENSHOT_SKIP_ATTR)
    expect(body).toContain('size-11')
  })

  it('shows its label in the side nav row, hides it below lg in a header, and has none as an icon', () => {
    expect(render(ReportBugButton, { props: { variant: 'row' } }).body).toContain('>Report a bug</span>')
    expect(render(ReportBugButton, { props: { variant: 'labelled' } }).body).toContain('hidden lg:inline')
    expect(render(ReportBugButton).body).not.toContain('</span>')
    expect(render(ReportBugButton, { props: { variant: 'small' } }).body).toContain('size-9')
  })

  it('is hidden when the server takes no reports', () => {
    info.feedback = false
    expect(render(ReportBugButton).body).not.toContain('Report a bug')
    info.feedback = true
  })
})

describe('screenshot', () => {
  it('hides the report button in the clone but keeps its space', () => {
    class FakeElement {
      style = { visibility: '' }
      constructor(private skip: boolean) {}
      hasAttribute = (name: string) => this.skip && name === SCREENSHOT_SKIP_ATTR
    }
    vi.stubGlobal('HTMLElement', FakeElement)
    const skipped = new FakeElement(true)
    const other = new FakeElement(false)
    hideSkipped(skipped as unknown as Node)
    hideSkipped(other as unknown as Node)
    vi.unstubAllGlobals()
    expect(skipped.style.visibility).toBe('hidden')
    expect(other.style.visibility).toBe('')
  })
})
