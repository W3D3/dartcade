<script lang="ts">
  // "Search users by name or email": a bits-ui Combobox over the admin user search (two letters or more),
  // keyboard and screen reader friendly. Choosing an account hands it up and clears the field.
  import { Combobox } from 'bits-ui'
  import { Search } from '@lucide/svelte'
  import { createUserSearch, type AdminUser } from '$lib/admin/users'

  let { label, onpick }: { label: string; onpick: (user: AdminUser) => void } = $props()

  let text = $state('')
  let open = $state(false)
  let found = $state<AdminUser[]>([])
  const search = createUserSearch(users => (found = users ?? []))

  function type(q: string): void {
    text = q
    open = true
    if (q.trim().length < 2) found = []
    else search.search(q.trim())
  }
</script>

<Combobox.Root
  type="single"
  bind:open
  inputValue={text}
  items={[]}
  onValueChange={id => {
    const user = found.find(u => u.id === id)
    text = ''
    found = []
    if (user) onpick(user)
  }}
>
  <div
    class="relative flex h-(--control-h) items-center gap-2 rounded-md border px-3 text-text-muted {open
      ? 'border-accent'
      : 'border-line-3'}"
  >
    <Search size={16} />
    <Combobox.Input
      aria-label={label}
      placeholder={label}
      autocomplete="off"
      spellcheck="false"
      oninput={e => type(e.currentTarget.value)}
      class="h-full min-w-0 grow bg-transparent text-label text-text outline-none placeholder:text-text-faint"
    />
  </div>
  <Combobox.Portal>
    <Combobox.Content
      sideOffset={6}
      collisionPadding={8}
      class="z-60 box-border w-(--bits-floating-anchor-width) rounded-popover border border-line-popover bg-surface-inset outline-none shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
    >
      <Combobox.Viewport class="flex max-h-60 flex-col gap-1 overflow-auto p-1.5">
        {#each found.slice(0, 8) as u (u.id)}
          <Combobox.Item
            value={u.id}
            label={u.name}
            class="flex w-full cursor-pointer flex-col rounded-md px-3 py-2 text-left outline-none data-[highlighted]:bg-surface-nav-active"
          >
            <span class="text-label">{u.name}</span><span class="text-caption text-text-dim">{u.email}</span>
          </Combobox.Item>
        {:else}
          <p class="px-3 py-2 text-small text-text-muted">{text.trim().length < 2 ? 'Type at least two letters.' : 'No account found.'}</p>
        {/each}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
