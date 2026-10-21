// A reward picked somewhere else (the level card's Next unlock): the rewards grid opens it on its
// tab and tries it on the card.
import { writable } from 'svelte/store'
import type { Perk } from '$shared/progression.js'

export const rewardFocus = writable<Perk | null>(null)
