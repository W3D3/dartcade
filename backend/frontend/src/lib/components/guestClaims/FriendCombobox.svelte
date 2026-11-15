<script lang="ts">
  // "Pick a friend": a searchable dropdown of your friends only (online first), for asking one to
  // take over a guest seat. Choosing one hands them up at once.
  import { Combobox } from 'bits-ui'
  import { ChevronDown } from '@lucide/svelte'
  import type { Friend } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import { friendOptions } from '$lib/guestClaims/view'
  import { me } from '$lib/lobby/sockets'
  import { statusLine } from '$lib/friends/view'

  let {
    label,
    exclude,
    disabled = false,
    onpick,
  }: { label: string; exclude: readonly string[]; disabled?: boolean; onpick: (friend: Friend) => void } = $props()

  let text = $state('')
  let open = $state(false)
  const options = $derived(friendOptions($me?.friends?.friends ?? [], text, exclude))
</script>

<Combobox.Root
  type="single"
  bind:open
  inputValue={text}
  {disabled}
  items={[]}
  onValueChange={id => {
    const friend = options.find(f => f.id === id)
    text = ''
    if (friend) onpick(friend)
  }}
>
  <div class="relative flex h-11 md:h-9 items-center rounded-lg border bg-surface-card {open ? 'border-accent' : 'border-line-strong'}">
    <Combobox.Input
      aria-label={label}
      placeholder="Pick a friend"
      autocomplete="off"
      spellcheck="false"
      oninput={e => {
        text = e.currentTarget.value
        open = true
      }}
      onfocus={() => (open = true)}
      onclick={() => (open = true)}
      class="h-full min-w-0 grow bg-transparent px-3 text-body text-text outline-none placeholder:text-text-faint"
    />
    <ChevronDown size={16} class="pointer-events-none mr-3 shrink-0 text-text-muted" />
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-60 box-border w-(--bits-floating-anchor-width) rounded-popover border border-line-popover bg-surface-inset outline-none shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
    >
      <Combobox.Viewport class="flex max-h-60 flex-col gap-1 overflow-auto p-1.5">
        {#each options as f (f.id)}
          <Combobox.Item
            value={f.id}
            label={f.name}
            class="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left outline-none data-[highlighted]:bg-surface-nav-active"
          >
            <Avatar name={f.name} face={{ avatar: f.avatar, userId: f.id }} size={32} />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-label font-semibold">{f.name}</span>
              <span class="text-caption text-text-muted">{statusLine(f).text}</span>
            </span>
          </Combobox.Item>
        {:else}
          <p class="px-3 py-2 text-small text-text-muted">{text === '' ? 'No friend to ask.' : `No friend called ${text}.`}</p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
