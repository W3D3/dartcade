<script lang="ts">
  // An admin bans a player (`#/admin/users`): the public category everyone sees, a note only
  // admins see, and how long: a set number of days, until a date, or for good.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import { DatePicker } from '$lib/components/ui/date-picker/index.js'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { BAN_CATEGORIES, BAN_CATEGORY_IDS, type BanCategory } from '$shared/bans.js'
  import { BAN_LENGTHS, banEnd, type BanLength } from '$lib/bans'

  let {
    name,
    error = '',
    onconfirm,
    oncancel,
  }: {
    name: string
    /** The server's refusal, shown under the form */
    error?: string
    onconfirm: (ban: { category: BanCategory; note: string | null; until: string | null }) => void
    oncancel: () => void
  } = $props()

  const NOTE_MAX = 1000
  let category = $state<BanCategory>('cheating')
  let note = $state('')
  let length = $state<BanLength>('7')
  let customDate = $state('')
  let formError = $state('')

  function submit(): void {
    const end = banEnd(length, customDate)
    if ('error' in end) {
      formError = end.error
      return
    }
    formError = ''
    onconfirm({ category, note: note.trim() || null, until: end.until })
  }
</script>

<Modal
  title="Ban {name}?"
  subtitle="They're signed out everywhere, leave their lobby, and forfeit a game they're playing. Their past games stay."
  onclose={oncancel}
  showClose={false}
  dismissOnBackdrop={true}
  widthClass="max-w-[460px]"
>
  <div class="flex flex-col gap-2">
    <span class="text-[13px] label-caps text-text-dim">Reason everyone sees</span>
    <Select
      label="Reason everyone sees"
      value={category}
      onchange={v => (category = BAN_CATEGORY_IDS.find(id => id === v) ?? category)}
      options={BAN_CATEGORY_IDS.map(id => ({ value: id, label: BAN_CATEGORIES[id] }))}
    />
  </div>
  <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
    Note for admins (optional)
    <textarea
      bind:value={note}
      maxlength={NOTE_MAX}
      rows="3"
      placeholder="What happened? Only admins see this."
      class="resize-y rounded-[10px] border border-line-3 bg-transparent px-3 py-2 text-[14px] normal-case tracking-normal text-text font-[inherit]"
    ></textarea>
  </label>
  <div class="flex flex-col gap-2">
    <span class="text-[13px] label-caps text-text-dim" id="ban-length">How long</span>
    <div class="flex flex-wrap gap-2" role="group" aria-labelledby="ban-length">
      {#each BAN_LENGTHS as l (l.value)}
        <Chip
          selected={length === l.value}
          onclick={() => {
            length = l.value
            formError = ''
          }}>{l.label}</Chip
        >
      {/each}
    </div>
    {#if length === 'custom'}
      <DatePicker label="Ban ends on" value={customDate} onchange={(v: string) => (customDate = v)} />
    {/if}
  </div>
  {#if formError || error}<ErrorText>{formError || error}</ErrorText>{/if}
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={oncancel}>Cancel</Button>
    <Button variant="accent" size="lg" class="flex-1 bg-live text-[#fff]" onclick={submit}>Ban</Button>
  {/snippet}
</Modal>
