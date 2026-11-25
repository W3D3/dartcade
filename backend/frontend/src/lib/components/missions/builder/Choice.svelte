<!-- A labelled row of choices (the builder's `.segr`), with the check's message under it. -->
<script lang="ts" generics="T">
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'

  let {
    label,
    options,
    value,
    error,
    onchange,
  }: {
    label: string
    options: readonly { readonly value: T; readonly label: string }[]
    value: T
    error?: string
    onchange: (v: T) => void
  } = $props()

  const id = $props.id()
</script>

<div class="flex min-w-0 flex-col gap-1.5">
  <span {id} class="text-label font-semibold">{label}</span>
  <SegmentedControl labelledby={id} options={[...options]} {value} {onchange} />
  {#if error}<span class="text-caption text-danger-text">{error}</span>{/if}
</div>
