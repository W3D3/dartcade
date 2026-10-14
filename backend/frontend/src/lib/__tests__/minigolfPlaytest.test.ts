import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import Playtest from '$lib/components/minigolf/Playtest.svelte'
import { testCourse } from '$shared/minigolf/courses/test'
import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'

const hole = testCourse.holes[0]

describe('playtest', () => {
  it('shows the dartboard, the stroke count and a reset button', () => {
    const { body } = render(Playtest, { props: { hole, physics: DEFAULT_PHYSICS } })
    expect(body).toContain('aria-label="Dartboard"')
    expect(body).toContain('Strokes 0')
    expect(body).toContain('Reset to tee')
  })
})
