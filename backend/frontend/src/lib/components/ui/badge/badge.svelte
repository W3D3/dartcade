<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		base: "inline-flex items-center gap-2 font-semibold",
		variants: {
			variant: {
				live:      "h-[30px] px-3 rounded-full bg-[#3a1a17] text-live-text text-[13px] font-bold tracking-widest",
				throwing:  "h-7 px-3 rounded-full bg-accent text-accent-fg text-[13px] tracking-[0.08em] uppercase",
				"up-next": "h-7 px-3 rounded-full border border-line text-text-dim text-[13px] tracking-[0.08em] uppercase",
			},
		},
		defaultVariants: { variant: "throwing" },
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";

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
