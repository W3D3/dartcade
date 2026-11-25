<!-- A number with its unit inside the field (the builder's `.numw`), and the check's message under it. -->
<script lang="ts">
  import { Input } from '$lib/components/ui/input/index.js'
  import { numberValue, shown } from '$lib/missions/builder'

  let {
    label,
    value,
    unit,
    error,
    optional = false,
    step = 1,
    onchange,
  }: {
    label: string
    value: number | undefined
    unit: string
    error?: string
    /** Empty means no value (undefined) rather than a missing one. */
    optional?: boolean
    step?: number
    onchange: (v: number | undefined) => void
  } = $props()

  const id = $props.id()
</script>

<div class="flex min-w-0 flex-col gap-1.5">
  <label for={id} class="text-label font-semibold">{label}</label>
  <span class="relative flex items-center">
    <Input
      {id}
      type="number"
      inputmode="numeric"
      {step}
      value={shown(value)}
      placeholder={optional ? 'No limit' : undefined}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
        const n = numberValue(e)
        onchange(optional && Number.isNaN(n) ? undefined : n)
      }}
      class="pr-16 {error ? 'border-danger-line' : ''}"
    />
    <span aria-hidden="true" class="pointer-events-none absolute right-3 text-small text-text-dim">{unit}</span>
  </span>
  {#if error}<span id="{id}-error" class="text-caption text-danger-text">{error}</span>{/if}
</div>
