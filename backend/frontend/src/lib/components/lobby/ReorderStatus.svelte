<script lang="ts">
  // For screen readers: the keys a list's drag handles take, and where the last move put someone.
  let {
    id,
    hint,
    announcement,
  }: {
    /** The handles' aria-describedby. */
    id: string
    hint: string
    announcement: string
  } = $props()
</script>

<span {id} class="sr-only">{hint}</span>
<span class="sr-only" aria-live="polite">{announcement}</span>
