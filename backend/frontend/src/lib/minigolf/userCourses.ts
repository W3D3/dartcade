import { derived, type Readable } from 'svelte/store'
import { api } from '$lib/api'
import { flag } from '$lib/flags'
import { userCourseCards, type CourseCard } from './editor/course'

const none: CourseCard[] = []

/** The published courses players made, for the viewer: empty while the flag is off. Read on first use, then kept while subscribed. */
export const userCourses: Readable<CourseCard[]> = derived(
  flag('minigolf.userCourses.enabled'),
  (on, set) => {
    set(none)
    if (!on) return
    void api.GET('/api/minigolf/courses').then(res => {
      if (res.data) set(userCourseCards(res.data.courses))
    })
  },
  none,
)
