<script lang="ts">
  // A visit's grade (Coach-Leg), or Tip for a note that leaves the grade alone.
  import { GRADE_PILL } from '$lib/coach/view'
  import type { VisitGrade } from '$shared/coach'

  let { grade }: { grade: VisitGrade | 'tip' } = $props()
  const pill = $derived(GRADE_PILL[grade])
</script>

<span class="inline-flex items-center h-6 px-[9px] box-border rounded-full text-[12px] font-bold whitespace-nowrap {pill.cls}"
  >{pill.label}</span
>
