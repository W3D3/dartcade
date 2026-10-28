<script lang="ts">
  // Report a bug or give feedback (the Alpha badge, Settings → Profile). Mounted once in Layout;
  // openFeedback() took the page's screenshot before this opened.
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { api } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import Chip from '$lib/components/ui/chip/chip.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { buildReport, canSend, closeFeedback, feedbackDialog, MESSAGE_MAX, pageContext, type FeedbackForm } from '$lib/feedback/report'

  const KINDS: { id: FeedbackForm['kind']; label: string }[] = [
    { id: 'bug', label: 'Bug' },
    { id: 'idea', label: 'Idea' },
    { id: 'other', label: 'Other' },
  ]

  let form = $state<FeedbackForm>({ kind: 'bug', message: '', includeScreenshot: true })
  let sending = $state(false)
  let sent = $state(false)
  let error = $state('')

  const dialog = $derived($feedbackDialog)
  const context = $derived(dialog ? pageContext() : null)
  const role = $derived($currentUser?.isAdmin ? 'admin' : $currentUser?.isModerator ? 'moderator' : 'user')

  function close() {
    closeFeedback()
    form = { kind: 'bug', message: '', includeScreenshot: true }
    sent = false
    error = ''
  }

  async function send(e: SubmitEvent) {
    e.preventDefault()
    if (!dialog || !context || !canSend(form.message) || sending) return
    sending = true
    error = ''
    try {
      const { response } = await api.POST('/api/feedback', { body: buildReport(form, context, dialog.screenshot) })
      if (response.ok) sent = true
      else if (response.status === 429) error = "You've sent a few reports already. Try again in a while."
      else if (response.status === 413) error = 'The screenshot is too large. Untick it and send again.'
      else error = "Couldn't send the report. Try again."
    } catch {
      error = "Couldn't send the report. Try again."
    } finally {
      sending = false
    }
  }
</script>

{#if dialog && context}
  <Modal
    title={sent ? 'Thanks!' : 'Report a bug'}
    subtitle={sent ? 'Your report is on its way.' : 'Or share an idea. Dartcade is in alpha, so every report helps.'}
    onclose={close}
    widthClass="max-w-[520px]"
    zClass="z-[200]"
  >
    {#if !sent}
      <form id="feedback-form" class="flex flex-col gap-4" onsubmit={send}>
        <div role="group" aria-label="Type" class="flex gap-2">
          {#each KINDS as k (k.id)}
            <Chip selected={form.kind === k.id} onclick={() => (form.kind = k.id)}>{k.label}</Chip>
          {/each}
        </div>

        <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
          What happened?
          <textarea
            bind:value={form.message}
            maxlength={MESSAGE_MAX}
            rows="5"
            required
            placeholder={form.kind === 'bug' ? 'What did you do, what did you expect, what happened instead?' : 'Tell us more'}
            class="resize-y rounded-[10px] border border-line-3 bg-transparent px-3 py-2 text-[14px] normal-case tracking-normal text-text font-[inherit]"
          ></textarea>
          <span class="self-end normal-case tracking-normal text-[12px]">{form.message.length} / {MESSAGE_MAX}</span>
        </label>

        {#if dialog.screenshot}
          <label class="flex items-center gap-3 cursor-pointer text-[14px]">
            <Checkbox bind:checked={form.includeScreenshot} class="size-5" />
            Include a screenshot of this page
          </label>
          {#if form.includeScreenshot}
            <img src={dialog.screenshot} alt="Screenshot of the page to send" class="w-full rounded-[10px] border border-line-2" />
          {/if}
        {:else if dialog.captureFailed}
          <p class="m-0 text-[13px] text-warn">Couldn't take a screenshot of this page; the report goes without one.</p>
        {/if}

        <details class="text-[13px] text-text-muted">
          <summary class="cursor-pointer">Sent along with your report</summary>
          <dl class="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt class="text-text-dim">Account</dt>
            <dd class="m-0 break-all">{$currentUser?.name} · {$currentUser?.email} · {role}</dd>
            <dt class="text-text-dim">Page</dt>
            <dd class="m-0 break-all font-mono">{context.route}</dd>
            {#if context.sessionId}
              <dt class="text-text-dim">Game</dt>
              <dd class="m-0 break-all font-mono">{context.sessionId}</dd>
            {/if}
            <dt class="text-text-dim">App</dt>
            <dd class="m-0 font-mono">{context.version}{context.commit ? ` (${context.commit.slice(0, 7)})` : ''}</dd>
            <dt class="text-text-dim">Browser</dt>
            <dd class="m-0 break-all">{context.userAgent}</dd>
            <dt class="text-text-dim">Screen</dt>
            <dd class="m-0">{context.viewport} · {context.locale}</dd>
            <dt class="text-text-dim">Time</dt>
            <dd class="m-0">Now</dd>
          </dl>
        </details>

        {#if error}<ErrorText class="text-[13px]">{error}</ErrorText>{/if}
      </form>
    {/if}
    {#snippet footer()}
      {#if sent}
        <Button variant="accent" size="lg" class="flex-1" onclick={close}>Close</Button>
      {:else}
        <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={close}>Cancel</Button>
        <Button variant="accent" size="lg" class="flex-1" type="submit" form="feedback-form" disabled={!canSend(form.message) || sending}>
          {sending ? 'Sending…' : 'Send report'}
        </Button>
      {/if}
    {/snippet}
  </Modal>
{/if}
