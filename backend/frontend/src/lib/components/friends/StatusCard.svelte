<script lang="ts">
  // Friends page: "Your status", Online / Invisible, with what each means. Last in the aside on
  // tablets and desktops (Friends.dc.html / Tablet-Friends.dc.html); first on phones
  // (Friends-Phone.dc.html) — Friends.svelte handles that ordering.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { applyStatusPick, STATUS_COPY, type StatusPickResult } from '$lib/presence'
  import { isPhone } from '$lib/viewport'

  let { invisible, onchange }: { invisible: boolean; onchange: (invisible: boolean) => StatusPickResult } = $props()
  const options = [
    { value: false, label: 'Online' },
    { value: true, label: 'Invisible' },
  ]
  const copy = $derived($isPhone ? STATUS_COPY.phone : STATUS_COPY.page)

  // Re-keying SegmentedControl after a failed pick discards its locally-overridden `value`
  // (see presence.ts's applyStatusPick) and reinitializes it from the real `invisible` prop, so
  // a refused change shows the previous choice again instead of sticking on the clicked one.
  let attempt = $state(0)
  const revert = () => {
    attempt += 1
  }

  function pick(v: unknown) {
    if (typeof v === 'boolean') void applyStatusPick(onchange, v, revert)
  }
</script>

<section aria-label="Your status" class="flex flex-col gap-3 p-4 md:p-5 rounded-[14px] bg-surface-panel border border-line-2">
  <h2 class="m-0 text-[15px] md:text-[17px] font-semibold">Your status</h2>
  {#key attempt}
    <SegmentedControl {options} value={invisible} onchange={pick} />
  {/key}
  <p class="m-0 text-[13px] leading-[1.4] text-text-muted">{invisible ? copy.invisible : copy.online}</p>
</section>
