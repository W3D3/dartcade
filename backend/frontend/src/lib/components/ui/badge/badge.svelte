<script lang="ts" module>
	export { badgeVariants, type BadgeVariant } from "./badge-variants.js";
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";
	import { badgeVariants, type BadgeVariant } from "./badge-variants.js";

	let { variant = "throwing", class: className = "", children }: {
		variant?: BadgeVariant;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)}>
	{#if variant === "live"}
		<span class="w-2 h-2 rounded-full bg-live shrink-0"></span>
	{/if}
	{@render children?.()}
</span>
