<script lang="ts">
  // The phone's burger menu (below md): a left drawer listing every page the desktop side nav does,
  // under four headings, from the same data (`menuSections`). The tab bar keeps the main pages one
  // tap away. A bits-ui Dialog: focus stays in the drawer, Escape, the backdrop and any navigation
  // close it, and focus goes back to the burger.
  import { Dialog } from 'bits-ui'
  import { location } from 'svelte-spa-router'
  import { Menu, X } from '@lucide/svelte'
  import { isActiveRoute, menuSections } from '$lib/nav'
  import { NAV_ICONS, navState } from '$lib/navState'
  import NavBadge from './NavBadge.svelte'
  import NavLink from './NavLink.svelte'

  const sections = $derived(menuSections($navState))
  // Something to look at on the burger itself while it is closed
  const waiting = $derived(sections.flatMap(s => s.links).reduce((n, l) => n + (l.badge ?? 0), 0))

  let open = $state(false)
  // Boards is a Settings section, so Settings is not also the current page there
  const isActive = (loc: string, href: string) => isActiveRoute(loc, href) && !(href === '/settings' && loc.startsWith('/settings/boards'))

  // Any navigation closes it
  $effect(() => location.subscribe(() => (open = false)))
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    aria-label="Menu"
    class="relative -ml-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text hover:bg-surface-hover md:hidden"
  >
    <Menu size={22} strokeWidth={1.8} />
    {#if waiting > 0}<NavBadge count={waiting} hidden label="" class="absolute top-1 right-0 border-2 border-surface-1" />{/if}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay data-screenshot-omit class="fixed inset-0 z-50 bg-black/60 md:hidden" />
    <Dialog.Content
      data-screenshot-omit
      preventScroll={false}
      class="fixed inset-y-0 left-0 z-50 box-border flex w-[min(320px,calc(100vw-48px))] flex-col gap-4 overflow-y-auto border-r border-line bg-surface-1
        pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(16px+env(safe-area-inset-bottom))] pl-[calc(12px+env(safe-area-inset-left))] pr-3 outline-none md:hidden"
    >
      <div class="flex items-center justify-between pl-2">
        <Dialog.Title class="font-display text-section-title uppercase">Menu</Dialog.Title>
        <Dialog.Close
          aria-label="Close menu"
          class="flex size-11 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-dim hover:text-text"
        >
          <X size={20} />
        </Dialog.Close>
      </div>
      {#each sections as section (section.label)}
        <nav aria-label={section.label} class="flex flex-col gap-1">
          <h3 class="px-3 pb-1 text-caption font-semibold label-caps text-text-muted">{section.label}</h3>
          {#each section.links as link (link.href)}
            {@const Icon = NAV_ICONS[link.icon]}
            {@const active = isActive($location, link.href)}
            <NavLink href={`#${link.href}`} {active} disabled={link.disabled}>
              <Icon size={20} strokeWidth={1.8} class={active ? 'text-accent' : ''} />
              {link.label}
              {#if link.badge}<NavBadge count={link.badge} label={link.badgeLabel ?? ''} class="ml-auto" />{/if}
              {#if link.soon}
                <span
                  class="ml-auto text-caption font-medium tracking-wordmark uppercase text-text-dim border border-line-3 rounded-[5px] px-[7px] py-[3px]"
                >
                  Soon
                </span>
              {/if}
            </NavLink>
          {/each}
        </nav>
      {/each}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
