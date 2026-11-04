<script lang="ts">
  // A visit's grade (Coach-Leg), or Tip for a note that leaves the grade alone.
  import { GRADE_STYLE } from '$lib/coach/tone'
  import type { VisitGrade } from '$shared/coach'
  import Pill from './Pill.svelte'

  let { grade }: { grade: VisitGrade | 'tip' } = $props()
</script>

<Pill label={GRADE_STYLE[grade].label} tone={GRADE_STYLE[grade].tone} />
