<script lang="ts">
  // A day and a time of day: the themed date picker and a time field, as one datetime-local value
  // ("2026-11-23T19:00", '' for none). Picking a day without a time takes 19:00.
  import { DatePicker } from '$lib/components/ui/date-picker/index.js'
  import { Input } from '$lib/components/ui/input/index.js'

  let { label, value, onchange }: { label: string; value: string; onchange: (v: string) => void } = $props()

  const day = $derived(value.slice(0, 10))
  const time = $derived(value.slice(11, 16))
</script>

<div class="flex gap-2">
  <DatePicker
    label="{label} date"
    class="min-w-0 grow"
    value={day}
    onchange={(d: string) => onchange(d ? `${d}T${time || '19:00'}` : '')}
  />
  <Input
    type="time"
    aria-label="{label} time"
    class="h-11 w-[140px] shrink-0 scheme-dark"
    value={time}
    disabled={!day}
    oninput={(e: Event & { currentTarget: HTMLInputElement }) => e.currentTarget.value && onchange(`${day}T${e.currentTarget.value}`)}
  />
</div>
