<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-[52px] w-full min-w-0 rounded-[10px] border border-line-3 bg-surface-2 px-4 text-base text-text outline-none placeholder:text-[#7d7f74] focus-visible:[outline:2px_solid_#c6f24e] focus-visible:[outline-offset:2px] disabled:pointer-events-none disabled:opacity-50",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-[52px] w-full min-w-0 rounded-[10px] border border-line-3 bg-surface-2 px-4 text-base text-text outline-none placeholder:text-[#7d7f74] focus-visible:[outline:2px_solid_#c6f24e] focus-visible:[outline-offset:2px] disabled:pointer-events-none disabled:opacity-50",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
