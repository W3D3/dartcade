import { type VariantProps, tv } from "tailwind-variants";
import { type WithElementRef } from "$lib/utils.js";
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

export const buttonVariants = tv({
	base: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-opacity outline-none select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:[outline:2px_solid_#c6f24e] focus-visible:[outline-offset:2px]",
	variants: {
		variant: {
			primary:     "h-[54px] px-6 rounded-[10px] bg-accent text-accent-fg font-display font-bold text-xl tracking-widest uppercase",
			secondary:   "h-[56px] px-6 rounded-[12px] bg-text text-accent-fg font-display font-bold text-xl uppercase tracking-widest",
			ghost:       "h-10 px-[14px] rounded-[10px] border border-line-3 text-[#c9c9bf] text-sm",
			outline:     "h-10 px-4 rounded-[10px] border border-line-3 text-text text-sm",
			destructive: "h-10 px-4 rounded-[10px] border border-live-text text-live-text text-sm",
		},
	},
	defaultVariants: { variant: "primary" },
});

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = string;

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
	WithElementRef<HTMLAnchorAttributes> & {
		variant?: ButtonVariant;
	};

