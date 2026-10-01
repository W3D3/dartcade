import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type WithElementRef<T, E extends Element = Element> = T & {
  ref?: E | null;
};

export type WithoutChildrenOrChild<T> = Omit<T, "children" | "child">;
