// The Friends drawer (Friends-Drawer, Tablet-Friends-Drawer boards): opened by the Friends button
// in the side nav or rail, beside it. Phones have no drawer; their Friends tab is the page.
import { writable } from 'svelte/store'
import { location } from 'svelte-spa-router'

export const friendsDrawerOpen = writable(false)

// Any navigation (a link in the drawer, Join, the browser's back) closes it. Here rather than in
// the drawer: every page has its own Layout, so the drawer is mounted again on the next page.
location.subscribe(() => friendsDrawerOpen.set(false))
